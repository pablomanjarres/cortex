export interface GtmDailyLog {
  date: string
  dmsSent: number
  dmResponses: number
  demoCalls: number
  xReplies: number
  xFollowers: number
  redditComments: number
  linkedinMessages: number
  postsPublished: number
  channelOfSignup: string
  notes: string
}

export interface GtmPhaseState {
  currentPhase: 1 | 2 | 3 | 4 | 5
  phaseStartDates: Record<number, string>
  exitCriteria: Record<number, Record<string, boolean>>
}

export interface GtmHistoryEntry {
  date: string
  dmsSent: number
  dmResponses: number
  demoCalls: number
  xReplies: number
  xFollowers: number
  redditComments: number
  linkedinMessages: number
  postsPublished: number
}

export const EMPTY_DAILY_LOG: GtmDailyLog = {
  date: '',
  dmsSent: 0,
  dmResponses: 0,
  demoCalls: 0,
  xReplies: 0,
  xFollowers: 0,
  redditComments: 0,
  linkedinMessages: 0,
  postsPublished: 0,
  channelOfSignup: '',
  notes: '',
}

export const DEFAULT_PHASE_STATE: GtmPhaseState = {
  currentPhase: 1,
  phaseStartDates: {},
  exitCriteria: {},
}
