export const haptic = (p: number | number[] = 12) => {
  try {
    navigator.vibrate?.(p)
  } catch {
    /* not supported */
  }
}

const playBeep = () => {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.3
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
    setTimeout(() => {
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.frequency.value = 1100
      gain2.gain.value = 0.3
      osc2.start()
      osc2.stop(ctx.currentTime + 0.2)
    }, 200)
  } catch {
    /* no audio */
  }
}

export const notifyRestDone = () => {
  playBeep()
  haptic([140, 70, 140])
}
