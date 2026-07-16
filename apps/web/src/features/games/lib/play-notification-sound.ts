/**
 * Soft dual-tone ping for invite / application alerts.
 * Uses Web Audio so we don't ship media assets.
 */
export function playNotificationSound(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) {
      return;
    }

    const context = new AudioCtx();
    const now = context.currentTime;

    function tone(frequency: number, start: number, duration: number, gainPeak: number) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }

    tone(880, now, 0.12, 0.07);
    tone(1175, now + 0.1, 0.16, 0.055);

    window.setTimeout(() => {
      void context.close();
    }, 500);
  } catch {
    // Autoplay / unsupported — ignore.
  }
}
