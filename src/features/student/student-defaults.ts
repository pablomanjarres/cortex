// Default seed data for the Student section — Pablo's real course plan.
//
// These used to live as useStore fallbacks inside StudentPage, which meant they
// were rendered but NEVER persisted until the first in-app edit. Any other
// consumer of the store (MaterialsTab/NotesTab read with a [] fallback, and the
// MCP server is a separate process entirely) saw an empty/missing key and the
// study tools failed with "Cortex has no courses yet". seedStudentDefaults()
// runs once at app launch and persists each key that has never been written.
import { readStore, updateStoreValue } from '@/lib/store'
import type { Assignment, Course, Topic } from './student-types'

export const DEFAULT_SEMESTERS = ['4th Semester', '3rd Semester']

export const DEFAULT_COURSES: Course[] = [
  // 3rd Semester
  { id: 'formales', name: 'Formal Languages', difficulty: 'Hard', iconKey: 'file', semester: '3rd Semester', status: 'Normal', credits: 3 },
  { id: 'physics', name: 'Physics II', difficulty: 'Hard', iconKey: 'flask', semester: '3rd Semester', status: 'Normal', credits: 3 },
  { id: 'algorithms', name: 'Algorithms', difficulty: 'Easy', iconKey: 'code', semester: '3rd Semester', status: 'Normal', credits: 3 },
  { id: 'dbms', name: 'DB Management', difficulty: 'Medium', iconKey: 'database', semester: '3rd Semester', status: 'Normal', credits: 3 },
  { id: 'stats', name: 'Prob & Stats', difficulty: 'Easy', iconKey: 'chart', semester: '3rd Semester', status: 'Normal', credits: 3 },
  { id: 'imagination', name: 'Creativity', difficulty: 'Easy', iconKey: 'palette', semester: '3rd Semester', status: 'Normal', credits: 3 },
  // 4th Semester (2026-2, starts 2026-07-15) — seeded from the Google Calendar class schedule
  { id: 'calculo3', name: 'Cálculo 3', difficulty: 'Hard', iconKey: 'sigma', semester: '4th Semester', status: 'Normal', credits: 3 },
  { id: 'softeng', name: 'Ingeniería de Software', difficulty: 'Medium', iconKey: 'blocks', semester: '4th Semester', status: 'Normal', credits: 3 },
  { id: 'comporg', name: 'Organización de Computadores', difficulty: 'Medium', iconKey: 'cpu', semester: '4th Semester', status: 'Normal', credits: 3 },
  { id: 'os', name: 'Sistemas Operativos', difficulty: 'Hard', iconKey: 'terminal', semester: '4th Semester', status: 'Normal', credits: 3 },
  { id: 'debates', name: 'Debates Humanísticos', difficulty: 'Easy', iconKey: 'messages', semester: '4th Semester', status: 'Normal', credits: 3 },
  { id: 'sysinfo', name: 'Sistemas de Información', difficulty: 'Easy', iconKey: 'network', semester: '4th Semester', status: 'Normal', credits: 3 },
]

export const DEFAULT_TOPICS: Topic[] = [
  { id: 't1', name: 'Kinetics', courseId: 'physics', chapter: 'Fray man 12.1-12.2', types: ['Concept'], mastery: 5, status: 'Seen', priority: 'High', week: 3 },
]

export const DEFAULT_ASSIGNMENTS: Assignment[] = [
  // ── Formal Languages (6) ──
  { id: 'f1', name: 'Practice 1', courseId: 'formales', type: 'Exam', weight: 0.10, deadline: '2026-02-09', done: false, priority: 'High', notes: 'Can use iPad' },
  { id: 'f2', name: 'Partial 1', courseId: 'formales', type: 'Exam', weight: 0.20, deadline: '2026-02-18', done: false, priority: 'High', notes: 'Can use iPad' },
  { id: 'f3', name: 'Practice 2', courseId: 'formales', type: 'Exam', weight: 0.10, deadline: '2026-03-02', done: false, priority: 'High', notes: 'Can use iPad' },
  { id: 'f4', name: 'Partial 2', courseId: 'formales', type: 'Exam', weight: 0.20, deadline: '2026-03-25', done: false, priority: 'High', notes: 'Can use iPad' },
  { id: 'f5', name: 'Practice 3', courseId: 'formales', type: 'Exam', weight: 0.20, deadline: '2026-05-18', done: false, priority: 'High', notes: 'Can use iPad' },
  { id: 'f6', name: 'Partial 3', courseId: 'formales', type: 'Exam', weight: 0.20, deadline: '2026-05-11', done: false, priority: 'High', notes: 'Can use iPad' },
  // ── Physics II (17) ──
  { id: 'p1', name: 'Lab 1', courseId: 'physics', type: 'Lab', weight: 0.021, grade: 5.0, deadline: '2026-01-29', done: true, priority: 'Medium' },
  { id: 'p2', name: 'Lab 2', courseId: 'physics', type: 'Lab', weight: 0.021, grade: 4.7, deadline: '2026-02-05', done: true, priority: 'Medium' },
  { id: 'p3', name: 'Lab 3', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-02-12', done: false, priority: 'Medium' },
  { id: 'p4', name: 'Quiz 1', courseId: 'physics', type: 'Quiz', weight: 0.03, deadline: '2026-02-13', done: false, priority: 'Low' },
  { id: 'p5', name: 'Expo', courseId: 'physics', type: 'Presentation', weight: 0.10, deadline: '2026-02-17', done: false, priority: 'High' },
  { id: 'p6', name: 'Lab 4', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-02-19', done: false, priority: 'Medium' },
  { id: 'p7', name: 'Lab 5', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-02-26', done: false, priority: 'Medium' },
  { id: 'p8', name: 'Test 1', courseId: 'physics', type: 'Exam', weight: 0.20, deadline: '2026-02-28', done: false, priority: 'High' },
  { id: 'p9', name: 'Lab 6', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-03-12', done: false, priority: 'Medium' },
  { id: 'p10', name: 'Quiz 2', courseId: 'physics', type: 'Quiz', weight: 0.03, deadline: '2026-03-15', done: false, priority: 'Low' },
  { id: 'p11', name: 'Lab 7', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-03-19', done: false, priority: 'Medium' },
  { id: 'p12', name: 'Lab 8', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-03-26', done: false, priority: 'Medium' },
  { id: 'p13', name: 'Lab 9', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-04-09', done: false, priority: 'Medium' },
  { id: 'p14', name: 'Test 2', courseId: 'physics', type: 'Exam', weight: 0.20, deadline: '2026-04-11', done: false, priority: 'High' },
  { id: 'p15', name: 'Lab 10', courseId: 'physics', type: 'Lab', weight: 0.021, deadline: '2026-04-16', done: false, priority: 'Medium' },
  { id: 'p16', name: 'Quiz 3', courseId: 'physics', type: 'Quiz', weight: 0.03, deadline: '2026-05-03', done: false, priority: 'Low' },
  { id: 'p17', name: 'Test 3', courseId: 'physics', type: 'Exam', weight: 0.20, deadline: '2026-05-23', done: false, priority: 'High' },
  // ── Algorithms (8) ──
  { id: 'a1', name: 'Test 1', courseId: 'algorithms', type: 'Exam', weight: 0.15, deadline: '2026-02-17', done: false, priority: 'High' },
  { id: 'a2', name: 'Project 1', courseId: 'algorithms', type: 'Project', weight: 0.15, deadline: '2026-03-24', done: false, priority: 'High' },
  { id: 'a3', name: 'Test 2', courseId: 'algorithms', type: 'Exam', weight: 0.15, deadline: '2026-03-31', done: false, priority: 'High' },
  { id: 'a4', name: 'Surprise Quiz 1', courseId: 'algorithms', type: 'Quiz', weight: 0.05, done: false, priority: 'Low' },
  { id: 'a5', name: 'Surprise Quiz 2', courseId: 'algorithms', type: 'Quiz', weight: 0.05, done: false, priority: 'Low' },
  { id: 'a6', name: 'Test 3', courseId: 'algorithms', type: 'Exam', weight: 0.15, deadline: '2026-05-12', done: false, priority: 'High' },
  { id: 'a7', name: 'Project 2', courseId: 'algorithms', type: 'Project', weight: 0.20, done: false, priority: 'High' },
  { id: 'a8', name: 'Class Participation', courseId: 'algorithms', type: 'Attendance', weight: 0.10, done: false, priority: 'Low' },
  // ── DB Management (9) ──
  { id: 'd1', name: 'Quiz 1', courseId: 'dbms', type: 'Quiz', weight: 0.05, grade: 5.0, deadline: '2026-02-10', done: true, priority: 'Low' },
  { id: 'd2', name: 'Test 1', courseId: 'dbms', type: 'Exam', weight: 0.15, deadline: '2026-02-17', done: false, priority: 'High' },
  { id: 'd3', name: 'Project 1', courseId: 'dbms', type: 'Project', weight: 0.10, deadline: '2026-03-10', done: false, priority: 'Medium' },
  { id: 'd4', name: 'Quiz 2', courseId: 'dbms', type: 'Quiz', weight: 0.05, deadline: '2026-03-17', done: false, priority: 'Low' },
  { id: 'd5', name: 'Test 2', courseId: 'dbms', type: 'Exam', weight: 0.20, deadline: '2026-03-24', done: false, priority: 'High' },
  { id: 'd6', name: 'Project 2', courseId: 'dbms', type: 'Project', weight: 0.10, deadline: '2026-04-07', done: false, priority: 'Medium' },
  { id: 'd7', name: 'Quiz 3', courseId: 'dbms', type: 'Quiz', weight: 0.05, deadline: '2026-04-21', done: false, priority: 'Low' },
  { id: 'd8', name: 'Test 3', courseId: 'dbms', type: 'Exam', weight: 0.15, deadline: '2026-05-12', done: false, priority: 'High' },
  { id: 'd9', name: 'Project 3', courseId: 'dbms', type: 'Project', weight: 0.15, deadline: '2026-05-19', done: false, priority: 'Medium' },
  // ── Prob & Stats (5) ──
  { id: 's1', name: 'Workshop - Test 1', courseId: 'stats', type: 'Exam', weight: 0.15, grade: 5.0, deadline: '2026-02-24', done: true, priority: 'High' },
  { id: 's2', name: 'Test 1', courseId: 'stats', type: 'Exam', weight: 0.25, deadline: '2026-03-06', done: false, priority: 'High' },
  { id: 's3', name: 'Workshop - Test 2', courseId: 'stats', type: 'Exam', weight: 0.20, deadline: '2026-04-07', done: false, priority: 'High' },
  { id: 's4', name: 'Workshop - Test 3', courseId: 'stats', type: 'Exam', weight: 0.15, deadline: '2026-05-05', done: false, priority: 'High' },
  { id: 's5', name: 'Test 2', courseId: 'stats', type: 'Exam', weight: 0.25, deadline: '2026-05-22', done: false, priority: 'High' },
]

const SEEDS: ReadonlyArray<readonly [string, unknown]> = [
  ['cortex-student-semesters', DEFAULT_SEMESTERS],
  ['cortex-student-active-semester', DEFAULT_SEMESTERS[0]],
  ['cortex-student-courses', DEFAULT_COURSES],
  ['cortex-student-topics', DEFAULT_TOPICS],
  ['cortex-student-assignments', DEFAULT_ASSIGNMENTS],
]

/**
 * Persist the defaults for any student key that has never been written.
 * Only a missing key (null read) is seeded — an intentionally emptied list
 * stays empty. The write goes through the optimistic-concurrency queue with an
 * identity reducer, so a value that appears between read and write survives.
 */
export async function seedStudentDefaults(): Promise<void> {
  for (const [key, def] of SEEDS) {
    const current = await readStore<unknown>(key, null)
    if (current === null || current === undefined) {
      updateStoreValue(key, def, (prev) => prev)
    }
  }
}
