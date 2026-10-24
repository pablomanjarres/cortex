/** Gym dialogs scroll within the viewport and keep a 44px close target for phone use. */
export const GYM_DIALOG_CLOSE_CLASS = '[&_[data-slot=dialog-close]]:size-11'
export const GYM_SCROLL_DIALOG_CLASS = `max-h-[calc(100dvh-2rem)] overflow-y-auto ${GYM_DIALOG_CLOSE_CLASS}`
