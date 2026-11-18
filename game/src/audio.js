// Coral Heat — all sound is synthesised with WebAudio at runtime; there are no audio files.
// A tiny synth rack: engine hum that follows speed, a two-tone police siren, gunshots, UI
// clicks, cash-register blips and a lazy sunset chord loop for ambience. Everything is
// guarded so a suspended or missing AudioContext never breaks the game (e.g. screenshots).
window.CH = window.CH || {};

CH.Audio = (function () {
  let ctx = null, master = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenTimer = 0;
  let musicTimer = null, musicStep = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }
  function now() { return ctx ? ctx.currentTime : 0; }

  function engine(on, speedNorm) {
    if (!ctx) return;
    if (on && !engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 300;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    }
    if (engineOsc) {
      const t = now();
      engineOsc.frequency.setTargetAtTime(55 + speedNorm * 165, t, 0.08);
      engineFilter.frequency.setTargetAtTime(240 + speedNorm * 900, t, 0.1);
      engineGain.gain.setTargetAtTime(on ? 0.05 + speedNorm * 0.075 : 0.0, t, 0.12);
    }
  }

  function siren(on) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
    }
    if (sirenOsc) {
      sirenGain.gain.setTargetAtTime(on ? 0.028 : 0.0, now(), 0.2);
    }
  }
  // called every frame while police are near: wails the siren up and down
  function sirenTick(dt) {
    if (!sirenOsc || !ctx) return;
    sirenTimer += dt;
    const phase = (sirenTimer % 1.4) / 1.4;
    sirenOsc.frequency.setTargetAtTime(phase < 0.5 ? 720 : 980, now(), 0.05);
  }

  function blip(freq, dur, type, vol, when) {
    if (!ctx) return;
    const t = now() + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function click() { blip(660, 0.06, 'square', 0.06); }
  function cash() { blip(988, 0.09, 'square', 0.1); blip(1319, 0.14, 'square', 0.1, 0.07); }
  function reload() { blip(220, 0.05, 'square', 0.08); blip(330, 0.05, 'square', 0.08, 0.09); }
  function bump() { blip(70, 0.16, 'sine', 0.22); }

  function shot() {
    if (!ctx) return;
    const t = now();
    const len = Math.floor(ctx.sampleRate * 0.14);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    const g = ctx.createGain(); g.gain.value = 0.32;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  // a slow four-chord sunset loop: warm pads, very quiet, one chord every 2.4 s
  const CHORDS = [
    [261.6, 329.6, 392.0], [220.0, 261.6, 329.6],
    [174.6, 220.0, 261.6], [196.0, 246.9, 392.0],
  ];
  function musicStart() {
    if (!ctx || musicTimer) return;
    const playChord = () => {
      if (!ctx) return;
      const chord = CHORDS[musicStep % CHORDS.length]; musicStep++;
      const t = now();
      chord.forEach((fr) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = fr;
        g.gain.setValueAtTime(0.0, t);
        g.gain.linearRampToValueAtTime(0.016, t + 0.7);
        g.gain.linearRampToValueAtTime(0.0, t + 2.35);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 2.4);
      });
    };
    playChord();
    musicTimer = setInterval(playChord, 2400);
  }
  function musicStop() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  return { init, engine, siren, sirenTick, click, cash, reload, bump, shot, musicStart, musicStop };
})();
