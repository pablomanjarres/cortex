import {
  applyWorkHoursCommand,
  emptyWorkHoursState,
  type WorkHoursCommand,
  type WorkHoursState,
} from './work-hours-model.js'

export interface WorkHoursStore {
  read: () => Promise<WorkHoursState | null>
  write: (state: WorkHoursState) => Promise<void>
}

/** Serializes the whole read, transition, write cycle, then announces the committed result. */
export class WorkHoursService {
  private sequence: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly store: WorkHoursStore,
    private readonly onCommitted: (state: WorkHoursState) => void = () => {},
  ) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.sequence.then(operation, operation)
    this.sequence = result.then(() => undefined, () => undefined)
    return result
  }

  command(command: WorkHoursCommand, now = new Date().toISOString()): Promise<WorkHoursState> {
    return this.enqueue(async () => {
      const current = await this.store.read() ?? emptyWorkHoursState()
      const next = applyWorkHoursCommand(current, command, now)
      await this.store.write(next)
      this.onCommitted(next)
      return next
    })
  }

  load(): Promise<WorkHoursState> {
    return this.enqueue(async () => {
      const state = await this.store.read() ?? emptyWorkHoursState()
      this.onCommitted(state)
      return state
    })
  }

  restore(now = new Date().toISOString()): Promise<WorkHoursState> {
    return this.enqueue(async () => {
      const current = await this.store.read() ?? emptyWorkHoursState()
      if (!current.active || current.active.interrupted) {
        this.onCommitted(current)
        return current
      }
      const next = applyWorkHoursCommand(current, { type: 'mark-interrupted' }, now)
      await this.store.write(next)
      this.onCommitted(next)
      return next
    })
  }
}
