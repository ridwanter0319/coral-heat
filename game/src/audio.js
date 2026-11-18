// audio.js — every sound in Coral Heat is synthesised with WebAudio.
// There are no audio files: an engine hum from two detuned oscillators, a
// two-tone siren, a noise-burst gunshot, a little cash-register arpeggio and
// a soft filtered-noise sea breeze for ambience.
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let engineNodes = null;
  let sirenNodes = null;
  let ambientStarted = false;

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // --- one-shots -------------------------------------------------------

  function playGunshot() {
    if (!ensureContext()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.18);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.16);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
    src.stop(t + 0.2);
  }

  function playCashBlip() {
    if (!ensureContext()) return;
    const t = ctx.currentTime;
    [880, 1318].forEach(function (freq, i) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, t + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.12);
      osc.connect(gain).connect(master);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.14);
    });
  }

  function playThud() {
    if (!ensureContext()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  function playClick() {
    if (!ensureContext()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 660;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  // --- loops -----------------------------------------------------------

  function setEngine(on, speedRatio) {
    if (!ensureContext()) return;
    if (on && !engineNodes) {
      const oscA = ctx.createOscillator();
      oscA.type = 'sawtooth';
      const oscB = ctx.createOscillator();
      oscB.type = 'square';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      const gain = ctx.createGain();
      gain.gain.value = 0.0;
      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain).connect(master);
      oscA.start();
      oscB.start();
      engineNodes = { oscA, oscB, filter, gain };
    }
    if (engineNodes) {
      const t = ctx.currentTime;
      const base = 55 + speedRatio * 130;
      engineNodes.oscA.frequency.setTargetAtTime(base, t, 0.08);
      engineNodes.oscB.frequency.setTargetAtTime(base * 0.5 + 2, t, 0.08);
      engineNodes.filter.frequency.setTargetAtTime(300 + speedRatio * 900, t, 0.08);
      engineNodes.gain.gain.setTargetAtTime(on ? 0.10 : 0.0, t, 0.1);
      if (!on) {
        const nodes = engineNodes;
        engineNodes = null;
        window.setTimeout(function () {
          try { nodes.oscA.stop(); nodes.oscB.stop(); } catch (e) { /* already stopped */ }
        }, 400);
      }
    }
  }

  function setSiren(on) {
    if (!ensureContext()) return;
    if (on && !sirenNodes) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 700;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.7;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain).connect(osc.frequency);
      const gain = ctx.createGain();
      gain.gain.value = 0.045;
      osc.connect(gain).connect(master);
      osc.start();
      lfo.start();
      sirenNodes = { osc, lfo, gain };
    } else if (!on && sirenNodes) {
      const nodes = sirenNodes;
      sirenNodes = null;
      try { nodes.osc.stop(); nodes.lfo.stop(); } catch (e) { /* already stopped */ }
    }
  }

  function startAmbience() {
    if (!ensureContext() || ambientStarted) return;
    ambientStarted = true;
    // Sea breeze: looped noise through a slowly wandering bandpass.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(filter.frequency);
    src.connect(filter).connect(gain).connect(master);
    src.start();
    lfo.start();
  }

  window.CH = window.CH || {};
  window.CH.audio = {
    ensureContext,
    playGunshot,
    playCashBlip,
    playThud,
    playClick,
    setEngine,
    setSiren,
    startAmbience,
  };
})();
