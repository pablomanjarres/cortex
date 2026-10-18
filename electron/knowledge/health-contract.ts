// Response contract for GET /api/knowledge/health. Kept free of Node imports
// so the renderer can share it with the main-process reader.

export type KnowledgeHealth =
  | { status: 'ok'; readAt: string; modifiedAt: string; ageSeconds: number; health: Record<string, unknown> }
  | { status: 'missing' | 'invalid'; readAt: string; error: string }
