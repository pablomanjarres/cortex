import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { Habit } from '../src/lib/habits.ts'
import type { ExerciseLog, WorkoutSession } from '../src/types/gym.ts'
import { DailyPage } from '../src/features/daily/DailyPage.tsx'
import { HabitsPage } from '../src/features/habits/HabitsPage.tsx'
import { SprintProvider } from '../src/lib/sprint-context.ts'
import { DEFAULT_HABITS } from '../src/features/habits/habit-defaults.ts'
import { habitGoalLabel, habitProgress, parseGoal, weeklyHabitScore, withGoal } from '../src/features/habits/habit-progress.ts'
import { buildWeeklyAudit } from '../src/features/daily/weekly-audit.ts'
import { dayAgenda } from '../src/features/daily/components/homePanelUtils.tsx'
import { normalizeSessions, sessionStats } from '../src/features/gym/domain/workout-sessions.ts'
import { nextSetPosition } from '../src/features/gym/domain/workout-progress.ts'
import { foodFromDraft, mealsTotals } from '../src/features/gym/domain/nutrition.ts'
import { marketItemsTotal, spendBy } from '../src/features/gym/domain/market.ts'
import { weeksInMonth } from '../src/features/gym/domain/market-dates.ts'

// tsx's Node transform uses the classic JSX runtime for imported components.
Object.assign(globalThis, { React })

const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']
const checked = (id: string, days: string[]) => Object.fromEntries(days.map((day) => [day, { [id]: true }]))

test('weekly habit score counts goals, not days, and skips held, monthly and zero-goal habits', () => {
  const habits: Habit[] = [
    { id: 'gym', name: 'Gym', emoji: 'G', weeklyGoal: 3 },
    { id: 'read', name: 'Read', emoji: 'R', weeklyGoal: 0 },
    { id: 'swim', name: 'Swim', emoji: 'S', weeklyGoal: 7, onHold: true },
    { id: 'call', name: 'Call', emoji: 'C', cadence: 'monthly', monthlyGoal: 2 },
  ]
  const history = { ...checked('gym', week.slice(0, 4)), [week[5]]: { read: true, swim: true, call: true } }

  const result = weeklyHabitScore(habits, history, week)
  assert.equal(result.score, 100, 'four of three gym days is a met goal')
  assert.equal(result.completed, 3)
  assert.equal(result.goals, 3)
  assert.deepEqual(result.rows.map((row) => row.habit.id), ['gym', 'read'], 'zero-goal habits stay listed but unscored')
})

test('the weekly audit stores the same habit consistency that Stats and Habits show', () => {
  const habits: Habit[] = [{ id: 'gym', name: 'Gym', emoji: 'G', weeklyGoal: 3 }]
  const history = checked('gym', week.slice(0, 3))
  const audit = buildWeeklyAudit({
    weekDates: week,
    sessionsByDay: week.map(() => []),
    habits,
    habitHistory: history,
    founderHistory: [
      { date: '2026-09-15', commits: 2, users: 10, deploys: 1, mrr: 5, prsOpen: 0, prsMerged: 0 },
      { date: '2026-09-19', commits: 3, users: 12, deploys: 0, mrr: 7, prsOpen: 0, prsMerged: 0 },
      { date: '2026-09-21', commits: 9, users: 99, deploys: 9, mrr: 99, prsOpen: 0, prsMerged: 0 },
    ],
    generatedAt: new Date('2026-09-21T12:00:00Z'),
  })

  assert.equal(audit.weekId, '2026-W38')
  assert.equal(audit.habitStats.consistency, weeklyHabitScore(habits, history, week).score)
  assert.equal(audit.habitStats.consistency, 100)
  assert.deepEqual(audit.founderStats, { commits: 5, users: 12, mrr: 7, deploys: 1 })
})

test('monthly habits count the whole month of the viewed week and keep explicit zero goals', () => {
  const habit = withGoal<Habit>({ id: 'call', name: 'Call', emoji: 'C', weeklyGoal: 4 }, 'monthly', '2')
  assert.equal(habit.weeklyGoal, undefined, 'switching cadence drops the old goal')
  assert.equal(habitGoalLabel(habit), '2x/mo')

  const progress = habitProgress(habit, checked('call', ['2026-09-01', '2026-09-30']), week)
  assert.deepEqual(progress, { cadence: 'monthly', goal: 2, done: 2, met: true })

  assert.equal(parseGoal('0', 'weekly'), 0)
  assert.equal(parseGoal('', 'weekly'), 7)
  assert.equal(parseGoal('40', 'monthly'), 31)
})

test('Home and Habits fall back to the same default habits', () => {
  const daily = renderToStaticMarkup(
    React.createElement(MemoryRouter, null,
      React.createElement(SprintProvider, null, React.createElement(DailyPage))),
  )
  const habits = renderToStaticMarkup(React.createElement(HabitsPage))
  for (const habit of DEFAULT_HABITS) {
    assert.ok(daily.includes(habit.name), `${habit.name} is a Home shortcut`)
    assert.ok(habits.includes(habit.name), `${habit.name} is on the Habits page`)
  }
})

test('the habit row actions stay reachable by keyboard while hidden until hover', () => {
  const html = renderToStaticMarkup(React.createElement(HabitsPage))
  assert.match(html, /focus-within:opacity-100[^"]*"><button[^>]*aria-label="Edit habit"/)
})

test('Home day agenda omits finished deadlines and keeps overlapping events', () => {
  const agenda = dayAgenda('2026-09-15', {
    events: [{ title: 'Overnight', startDate: '2026-09-14T22:00:00', endDate: '2026-09-15T02:00:00', calendar: 'Cal', isAllDay: false }],
    sessionsByDay: {},
    assignments: [
      { id: 'open', name: 'Open', courseId: 'c', type: 'Project', weight: 1, deadline: '2026-09-15', done: false, priority: 'Medium' },
      { id: 'done', name: 'Done', courseId: 'c', type: 'Project', weight: 1, deadline: '2026-09-15', done: true, priority: 'Medium' },
    ],
  })
  assert.deepEqual(agenda.events.map((event) => event.title), ['Overnight'])
  assert.deepEqual(agenda.sessions, [])
  assert.deepEqual(agenda.deadlines.map((assignment) => assignment.id), ['open'])
})

const session = (exercises: ExerciseLog[]): WorkoutSession => ({
  date: '2026-09-15', workoutDayId: 'push', workoutName: 'PUSH', exercises, startedAt: '', completedFully: false,
})

test('stored gym days read as session lists and only completed sets count toward volume', () => {
  const legacy = session([{ exerciseId: 'bench', exerciseName: 'Bench', sets: [
    { weight: 60, reps: 10, completed: true },
    { weight: 100, reps: 10, completed: false },
  ] }])
  assert.deepEqual(normalizeSessions(legacy), [legacy])
  assert.deepEqual(normalizeSessions([legacy]), [legacy])
  assert.deepEqual(normalizeSessions({ unrelated: true }), [])
  assert.deepEqual(sessionStats([legacy, legacy]), { sets: 2, volume: 1200 })
})

test('after the last open set of an exercise, training wraps to an earlier unfinished exercise', () => {
  const done = { weight: 0, reps: 0, completed: true }
  const open = { weight: 0, reps: 0, completed: false }
  const logs: ExerciseLog[] = [
    { exerciseId: 'a', exerciseName: 'A', sets: [done, open] },
    { exerciseId: 'b', exerciseName: 'B', sets: [done, done] },
  ]
  assert.deepEqual(nextSetPosition(logs, 1, 1), { exerciseIndex: 0, setIndex: 1 })
  assert.deepEqual(nextSetPosition([{ ...logs[0], sets: [open, open] }], 0, 0), { exerciseIndex: 0, setIndex: 1 })
})

test('food drafts need a name, default blank macros to zero, and total defensively', () => {
  assert.equal(foodFromDraft({ name: '  ', quantity: '', protein: '10', calories: '100' }), null)
  assert.deepEqual(
    foodFromDraft({ name: ' Eggs ', quantity: ' ', protein: '', calories: 'x' }),
    { name: 'Eggs', protein: 0, calories: 0 },
  )
  assert.deepEqual(
    mealsTotals([{ foods: [{ name: 'A', protein: 10, calories: 100 }] }, { foods: undefined as never }]),
    { protein: 10, calories: 100 },
  )
})

test('market spend splits by store and the month view covers every overlapping week', () => {
  const items = [
    { price: 1000, quantity: 2, store: 'D1' },
    { price: 5000, quantity: 1, store: 'Exito' },
    { price: 500, quantity: 4, store: 'D1' },
  ]
  assert.equal(marketItemsTotal(items), 9000)
  assert.deepEqual(spendBy(items, (item) => item.store), [['Exito', 5000], ['D1', 4000]])
  assert.deepEqual(weeksInMonth(2026, 8), ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'])
})
