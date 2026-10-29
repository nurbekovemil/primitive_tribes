/**
 * Звуки, которые синтезируются на лету (без файлов): стук каменного молотка по дереву на стройке.
 * Браузер разрешает звук только после действия игрока, поэтому контекст будится первым нажатием.
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
    const len = Math.floor(ctx.sampleRate * 0.12);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

if (typeof window !== 'undefined') {
  const wake = () => void audio()?.resume();
  window.addEventListener('pointerdown', wake, { capture: true });
  window.addEventListener('keydown', wake, { capture: true });
}

/** Глухой удар дерева о дерево; volume 0..1. Высота чуть плавает, чтобы удары не звучали одинаково. */
export function knock(volume: number) {
  const a = audio();
  if (!a || !noise || a.state !== 'running' || volume <= 0.01) return;
  const t = a.currentTime;
  const out = a.createGain();
  out.gain.value = volume;
  out.connect(a.destination);
  const pitch = 0.85 + Math.random() * 0.3;

  // щелчок удара: короткий шум через полосовой фильтр
  const src = a.createBufferSource();
  src.buffer = noise;
  const band = a.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1100 * pitch;
  band.Q.value = 1.4;
  const ng = a.createGain();
  ng.gain.setValueAtTime(0.9, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  src.connect(band).connect(ng).connect(out);
  src.start(t);
  src.stop(t + 0.12);

  // гулкий «тук» бревна
  const osc = a.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(260 * pitch, t);
  osc.frequency.exponentialRampToValueAtTime(110 * pitch, t + 0.09);
  const og = a.createGain();
  og.gain.setValueAtTime(0.8, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  osc.connect(og).connect(out);
  osc.start(t);
  osc.stop(t + 0.15);
}
