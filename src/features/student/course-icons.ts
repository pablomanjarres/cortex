// Course icon registry — courses persist `iconKey` as a string (JSON-safe),
// resolved to a lucide component at render time. Shared by StudentPage
// (Overview) and MaterialsTab.

import {
  GraduationCap,
  FlaskConical,
  Code2,
  Database,
  BarChart3,
  Palette,
  FileCode,
  Sigma,
  Blocks,
  Cpu,
  Terminal,
  MessagesSquare,
  Network,
  BookOpen,
  Atom,
  Globe,
  PenTool,
  Calculator,
} from 'lucide-react'

export const ICONS: Record<string, typeof GraduationCap> = {
  grad: GraduationCap, flask: FlaskConical, code: Code2, database: Database,
  chart: BarChart3, palette: Palette, file: FileCode, sigma: Sigma, blocks: Blocks,
  cpu: Cpu, terminal: Terminal, messages: MessagesSquare, network: Network,
  book: BookOpen, atom: Atom, globe: Globe, pen: PenTool, calc: Calculator,
}

// Cycled when auto-styling newly added courses so each looks distinct.
export const ICON_CYCLE = ['book', 'atom', 'globe', 'pen', 'calc', 'grad', 'sigma', 'blocks', 'cpu', 'terminal', 'messages', 'network']
export const ICON_OPTIONS = Object.keys(ICONS)
