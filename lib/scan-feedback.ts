// Kurzer Erfolgston bzw. tiefer Doppelton bei Fehler — synthetisiert über die
// Web Audio API, keine Sounddateien. Nur im Browser aktiv; in Tests (jsdom,
// SSR) fehlt AudioContext und die Funktionen sind No-Ops.

function getAudioContext(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : undefined;
}

function playTone(ctx: AudioContext, frequency: number, startTime: number, durationSeconds: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.2, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSeconds);
}

/** Kurzer, heller Ton für einen erfolgreich erkannten Scan. */
export function playScanSuccess(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 1046.5, ctx.currentTime, 0.12);
}

/** Tiefer Doppelton für einen ungültigen Scan (falsche Prüfziffer o.ä.). */
export function playScanError(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone(ctx, 220, now, 0.15);
  playTone(ctx, 220, now + 0.18, 0.15);
}
