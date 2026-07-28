/**
 * Synthesized UI sound cues via the Web Audio API — no asset files, so it
 * stays within the self-only CSP. Lazily creates the AudioContext on first
 * play (which follows a user gesture, satisfying autoplay policy).
 */
type Cue = "tick" | "correct" | "wrong" | "pass" | "seal" | "open";

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One enveloped note. Times are seconds from now. */
function note(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = "sine",
  peak = 0.09
): void {
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playCue(cue: Cue): void {
  if (!enabled) return;
  const c = audio();
  if (!c) return;
  switch (cue) {
    case "tick":
      note(c, 660, 0, 0.05, "triangle", 0.05);
      break;
    case "correct":
      note(c, 659, 0, 0.12, "sine", 0.08);
      note(c, 988, 0.09, 0.16, "sine", 0.08);
      break;
    case "wrong":
      note(c, 196, 0, 0.2, "sawtooth", 0.06);
      note(c, 155, 0.06, 0.22, "sawtooth", 0.05);
      break;
    case "pass":
      [523, 659, 784, 1047].forEach((f, i) =>
        note(c, f, i * 0.1, 0.28, "sine", 0.085)
      );
      break;
    case "seal":
      note(c, 130, 0, 0.22, "sine", 0.11);
      note(c, 92, 0.02, 0.26, "triangle", 0.07);
      break;
    case "open":
      note(c, 420, 0, 0.22, "sine", 0.05);
      note(c, 700, 0.05, 0.26, "sine", 0.05);
      break;
  }
}
