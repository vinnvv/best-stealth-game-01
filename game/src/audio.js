// Every sound is made with WebAudio, no files: short oscillator and noise
// bursts shaped the way the design asks. The context is created on the first
// user gesture, so a silent page (or a headless screenshot run) simply stays
// quiet; every call is guarded so audio can never break the game.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let drone = null;
  let padTimer = null;

  function ensure() {
    if (ctx || muted) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  /** Call from any key or click handler: unlocks sound for the session. */
  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    if (c && padTimer === null) startPad();
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = null) {
    const c = ensure();
    if (!c) return;
    try {
      const t0 = c.currentTime + when;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch {
      // Sound is decoration; never let it stop the game.
    }
  }

  function noiseBurst(dur, filterFreq, gain, when = 0) {
    const c = ensure();
    if (!c) return;
    try {
      const t0 = c.currentTime + when;
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buffer = c.createBuffer(1, len, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(c.destination);
      src.start(t0);
    } catch {
      // As above: sound never breaks the game.
    }
  }

  function startPad() {
    // A very soft two-note pad, one note every 4 seconds, alternating A3/E4.
    let next = 0;
    padTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      tone(next % 2 === 0 ? 220 : 330, 3.0, 'sine', 0.04);
      next += 1;
    }, 4000);
  }

  /** A low sawtooth hum whose pitch follows the highest detection meter. */
  function setDrone(meter) {
    const c = ensure();
    if (!c || meter <= 0.01) {
      if (drone) {
        try {
          drone.osc.stop();
        } catch {
          // Already stopped.
        }
        drone = null;
      }
      return;
    }
    try {
      if (!drone) {
        const osc = c.createOscillator();
        const filter = c.createBiquadFilter();
        const g = c.createGain();
        osc.type = 'sawtooth';
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        g.gain.value = 0;
        osc.connect(filter);
        filter.connect(g);
        g.connect(c.destination);
        osc.start();
        drone = { osc, g };
      }
      const freq = 95 + (210 - 95) * meter;
      drone.osc.frequency.setTargetAtTime(freq, c.currentTime, 0.1);
      drone.g.gain.setTargetAtTime(0.05 + 0.07 * meter, c.currentTime, 0.1);
    } catch {
      // Drone failure is silent.
    }
  }

  return {
    unlock,
    setMuted(value) {
      muted = value;
      if (muted && drone) {
        try {
          drone.osc.stop();
        } catch {
          // Already stopped.
        }
        drone = null;
      }
    },
    isMuted() {
      return muted;
    },
    footstep() {
      noiseBurst(0.025, 420, 0.08);
    },
    pebble() {
      tone(1450, 0.06, 'triangle', 0.18, 0, 880);
      tone(1200, 0.05, 'triangle', 0.08, 0.12, 900);
    },
    spore() {
      tone(587, 0.09, 'sine', 0.2);
      tone(880, 0.18, 'sine', 0.2, 0.09);
    },
    alert() {
      tone(440, 0.28, 'square', 0.11);
      tone(466, 0.28, 'square', 0.11);
    },
    gate() {
      tone(330, 0.14, 'sine', 0.18);
      tone(494, 0.14, 'triangle', 0.18, 0.14);
      tone(659, 0.14, 'sine', 0.18, 0.28);
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.13, 'sine', 0.2, i * 0.13));
    },
    caught() {
      tone(220, 0.42, 'sawtooth', 0.25, 0, 75);
    },
    setDrone,
  };
}
