// Reading list model shared by the Books page and its record editor.

// ── Types ────────────────────────────────────────────────────────────────────

export type Status = 'Sin empezar' | 'En curso' | 'Hecho'
export type Score = '5 stars' | '4 stars' | '3 stars' | '2 stars' | '1 star' | 'Por decidir' | ''
export type SortKey = 'title' | 'author' | 'score' | 'genre'

export interface Book {
  id: string
  title: string
  author: string
  status: Status
  score: Score
  genre: string
  start: string
  finished: string
  notes: string
}

// ── Data ─────────────────────────────────────────────────────────────────────

export const DEFAULT_BOOKS: Book[] = [
  // Hecho
  { id: 'b1', title: 'University of Success', author: 'OG Mandino', status: 'Hecho', score: '5 stars', genre: 'Self Improvement', start: '', finished: '2025-06-17', notes: '' },
  { id: 'b2', title: 'El arte de la guerra', author: 'Sun Tzu', status: 'Hecho', score: '5 stars', genre: 'Novela', start: '', finished: '', notes: '' },
  { id: 'b3', title: 'The Millionaire Fastlane', author: 'MJ DeMarco', status: 'Hecho', score: '5 stars', genre: 'Economy & Finances', start: '', finished: '2024-02-01', notes: '' },
  { id: 'b4', title: 'The Intelligent Investor', author: 'Benjamin Graham', status: 'Hecho', score: '5 stars', genre: 'Economy & Finances', start: '', finished: '2024-02-01', notes: '' },
  { id: 'b5', title: 'La Odisea', author: 'Homero', status: 'Hecho', score: '4 stars', genre: 'Novela', start: '', finished: '2023-08-25', notes: '' },
  { id: 'b6', title: 'Las siete llaves', author: 'Alex Rovira', status: 'Hecho', score: '4 stars', genre: 'Self Improvement', start: '', finished: '2023-10-04', notes: '' },
  { id: 'b7', title: 'Economía Comestible', author: 'Ha-Joon Chang', status: 'Hecho', score: '3 stars', genre: 'Economy', start: '', finished: '2023-09-06', notes: '' },
  { id: 'b8', title: 'Historia Mínima de Colombia', author: 'Jorge Orlando Melo', status: 'Hecho', score: '', genre: 'History', start: '2024-05-22', finished: '', notes: '' },
  // En curso
  { id: 'b9', title: 'The Prince', author: 'Niccolò Machiavelli', status: 'En curso', score: '', genre: 'Philosophy', start: '2024-05-22', finished: '', notes: '' },
  { id: 'b10', title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', status: 'En curso', score: '4 stars', genre: 'Self Improvement', start: '', finished: '', notes: '' },
  // Sin empezar
  { id: 'b11', title: 'Think Again', author: 'Adam Grant', status: 'Sin empezar', score: '', genre: 'Self Improvement', start: '', finished: '', notes: '' },
  { id: 'b12', title: 'CBT for Beginners', author: 'Rachel', status: 'Sin empezar', score: '', genre: 'Psychology', start: '', finished: '', notes: '' },
  { id: 'b13', title: 'The Lean Startup', author: 'Eric Ries', status: 'Sin empezar', score: '', genre: 'Startup', start: '', finished: '', notes: '' },
  { id: 'b14', title: 'Imagine: How Creativity Works', author: 'Jonah Lehrer', status: 'Sin empezar', score: '', genre: '', start: '', finished: '', notes: '' },
  { id: 'b15', title: 'Moonwalking with Einstein', author: 'Joshua Foer', status: 'Sin empezar', score: '', genre: 'Self Improvement', start: '', finished: '', notes: '' },
  { id: 'b16', title: "The Heart of the Buddha's Teaching", author: 'Thich Nhat Hanh', status: 'Sin empezar', score: 'Por decidir', genre: 'Philosophy', start: '', finished: '', notes: '' },
  { id: 'b17', title: 'Tao Te Ching', author: 'Lao Tzu', status: 'Sin empezar', score: 'Por decidir', genre: 'Philosophy', start: '', finished: '', notes: '' },
  { id: 'b18', title: 'The Guide to Getting It On', author: 'Paul Joannides', status: 'Sin empezar', score: '', genre: 'Love', start: '', finished: '', notes: '' },
  { id: 'b19', title: 'King Arthur', author: 'Roger Lancelyn Green', status: 'Sin empezar', score: '', genre: '', start: '', finished: '', notes: '' },
  { id: 'b20', title: 'How to Write a Killer LinkedIn Profile', author: 'Brenda Bernstein', status: 'Sin empezar', score: '', genre: 'Professional', start: '', finished: '', notes: '' },
  { id: 'b21', title: 'The Greatest Salesman in the World', author: 'OG Mandino', status: 'Sin empezar', score: 'Por decidir', genre: 'Economy & Finances', start: '', finished: '', notes: '' },
  { id: 'b22', title: 'The Clean Coder', author: 'Robert C. Martin', status: 'Sin empezar', score: '', genre: 'Programming', start: '', finished: '', notes: '' },
  { id: 'b23', title: 'Design Patterns', author: 'Grady Booch', status: 'Sin empezar', score: '', genre: 'Programming', start: '', finished: '', notes: '' },
  { id: 'b24', title: 'JavaScript: The Good Parts', author: 'Douglas Crockford', status: 'Sin empezar', score: '', genre: 'Programming', start: '', finished: '', notes: '' },
  { id: 'b25', title: 'Learning JS Data Structures and Algorithms', author: 'Loiane Groner', status: 'Sin empezar', score: '', genre: 'Programming', start: '', finished: '', notes: '' },
  { id: 'b26', title: 'Refactoring', author: 'Martin Fowler', status: 'Sin empezar', score: '', genre: 'Programming', start: '', finished: '', notes: '' },
  { id: 'b27', title: 'Cálculo Infinitesimal', author: 'Juan de Burgos', status: 'Sin empezar', score: '', genre: 'Calculus', start: '', finished: '', notes: '' },
]

// ── Options ──────────────────────────────────────────────────────────────────

export const ALL_STATUSES: Status[] = ['En curso', 'Sin empezar', 'Hecho']
export const ALL_SCORES: Score[] = ['5 stars', '4 stars', '3 stars', '2 stars', '1 star', 'Por decidir', '']
export const ALL_GENRES = ['Self Improvement', 'Programming', 'Economy & Finances', 'Philosophy', 'Novela', 'Psychology', 'Startup', 'History', 'Economy', 'Love', 'Professional', 'Calculus']

export const scoreNum = (s: Score) => s === '5 stars' ? 5 : s === '4 stars' ? 4 : s === '3 stars' ? 3 : s === '2 stars' ? 2 : s === '1 star' ? 1 : 0
