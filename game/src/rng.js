// rng.js — deterministic randomness for Coral Heat.
// A tiny mulberry32 generator: the city layout, traffic colours and staged
// screenshot scenes all draw from one seeded stream so ?seed=1 always
// builds exactly the same Coral Bay.
(function () {
  'use strict';

  function makeRng(seed) {
    let state = (seed >>> 0) || 1;
    return function next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The active stream for this page load. Replaced by resetWorldRng when a
  // screenshot mode asks for a specific seed.
  let stream = makeRng(1337);

  function resetWorldRng(seed) {
    stream = makeRng(seed);
  }

  function rand() {
    return stream();
  }

  function randRange(min, max) {
    return min + stream() * (max - min);
  }

  function randInt(min, max) {
    return Math.floor(randRange(min, max + 1));
  }

  function pick(list) {
    return list[Math.floor(stream() * list.length) % list.length];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function distance2D(ax, az, bx, bz) {
    const dx = ax - bx;
    const dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // Shortest signed angle from `from` to `to`, in radians.
  function angleDelta(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  window.CH = window.CH || {};
  window.CH.rng = {
    makeRng,
    resetWorldRng,
    rand,
    randRange,
    randInt,
    pick,
    clamp,
    lerp,
    distance2D,
    angleDelta,
  };
})();
