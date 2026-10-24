import type { Assignment, Course } from './student-types'

/** Top of the Colombian grading scale. */
export const MAX_GRADE = 5

export interface CourseGrades {
  totalWeight: number
  gradedWeight: number
  /** Weighted average of graded work; undefined until something is graded. */
  current?: number
  /** Final grade if every ungraded item scores the maximum. */
  best: number
  /** Final grade if every ungraded item scores zero. */
  worst: number
  /** Graded weight as a 0–1 share of the course's total weight. */
  gradedShare: number
}

/** Grade standing for one course, from every assignment filed under it. */
export function courseGrades(assignments: ReadonlyArray<Assignment>, courseId: string): CourseGrades {
  let totalWeight = 0
  let gradedWeight = 0
  let ungradedWeight = 0
  let gradeSum = 0
  for (const a of assignments) {
    if (a.courseId !== courseId) continue
    totalWeight += a.weight
    if (a.grade === undefined) {
      ungradedWeight += a.weight
    } else {
      gradedWeight += a.weight
      gradeSum += a.grade * a.weight
    }
  }
  return {
    totalWeight,
    gradedWeight,
    current: gradedWeight > 0 ? gradeSum / gradedWeight : undefined,
    best: totalWeight > 0 ? (gradeSum + MAX_GRADE * ungradedWeight) / totalWeight : MAX_GRADE,
    worst: totalWeight > 0 ? gradeSum / totalWeight : 0,
    gradedShare: totalWeight > 0 ? gradedWeight / totalWeight : 0,
  }
}

/**
 * Credit-weighted GPA for a set of courses. `current` counts only courses with
 * graded work; `best` assumes every ungraded item scores the maximum.
 */
export function semesterGpa(
  courses: ReadonlyArray<Course>,
  gradesFor: (courseId: string) => CourseGrades,
): { current?: number; best: number } {
  let gradedCredits = 0, currentSum = 0, credits = 0, bestSum = 0
  for (const c of courses) {
    const g = gradesFor(c.id)
    if (g.current !== undefined) {
      currentSum += g.current * c.credits
      gradedCredits += c.credits
    }
    bestSum += g.best * c.credits
    credits += c.credits
  }
  return {
    current: gradedCredits > 0 ? currentSum / gradedCredits : undefined,
    best: credits > 0 ? bestSum / credits : MAX_GRADE,
  }
}
