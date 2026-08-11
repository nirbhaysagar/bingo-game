// Space-themed Synthesizer using Web Audio API

let isMuted = localStorage.getItem('bingo_audio_muted') === 'true';

export function getMuteState(): boolean {
  return isMuted;
}

export function setMuteState(mute: boolean) {
  isMuted = mute;
  localStorage.setItem('bingo_audio_muted', String(mute));
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  return new AudioContextClass();
}

// Helper to play a quick frequency sweep (Sonar Ping)
export function playPing() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(450, ctx.currentTime);
  // Frequency sweep upwards
  osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.35);

  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}

// Helper to play a short terminal click/tick
export function playTick() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1400, ctx.currentTime);

  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.06);
}

// Helper to play an arpeggio chord progression (completed line)
export function playSuccess() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const playNote = (freq: number, startDelay: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);

    gain.gain.setValueAtTime(0.0, ctx.currentTime + startDelay);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + startDelay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);

    osc.start(ctx.currentTime + startDelay);
    osc.stop(ctx.currentTime + startDelay + duration + 0.05);
  };

  // Play arpeggio C major: C4 (261.63), E4 (329.63), G4 (392.00), C5 (523.25)
  playNote(261.63, 0.0, 0.25);
  playNote(329.63, 0.08, 0.25);
  playNote(392.00, 0.16, 0.25);
  playNote(523.25, 0.24, 0.35);
}

// Celebratory fanfare progression (game won)
export function playVictory() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [
    { freq: 261.63, time: 0.0, dur: 0.15 }, // C4
    { freq: 329.63, time: 0.1, dur: 0.15 }, // E4
    { freq: 392.00, time: 0.2, dur: 0.15 }, // G4
    { freq: 523.25, time: 0.3, dur: 0.15 }, // C5
    { freq: 392.00, time: 0.4, dur: 0.15 }, // G4
    { freq: 523.25, time: 0.5, dur: 0.4 },  // C5 (long vibrato)
  ];

  notes.forEach((n) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.time);

    // Simple vibrato on final note
    if (n.freq === 523.25 && n.time > 0.4) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(8, ctx.currentTime + n.time);
      lfoGain.gain.setValueAtTime(15, ctx.currentTime + n.time);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(ctx.currentTime + n.time);
      lfo.stop(ctx.currentTime + n.time + n.dur);
    }

    gain.gain.setValueAtTime(0.0, ctx.currentTime + n.time);
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + n.time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.time + n.dur);

    osc.start(ctx.currentTime + n.time);
    osc.stop(ctx.currentTime + n.time + n.dur + 0.05);
  });
}

// Low frequency buzz sweep (missed click error)
export function playError() {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(150, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);

  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.2);
}

