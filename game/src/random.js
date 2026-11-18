// Coral Heat — small shared helpers: a seeded RNG (so the city, traffic and screenshots are
// deterministic for a given ?seed=) plus the maths shortcuts every other module leans on.
window.CH = window.CH || {};

(function () {
  let state = 1;

  // mulberry32: tiny, fast, good enough for palm trees and paint jobs.
  function setSeed(seed) {
    state = (seed >>> 0) || 1;
  }
  function random() {
    state |= 0; state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function range(a, b) { return a + random() * (b - a); }
  function randi(a, b) { return Math.floor(range(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(random() * arr.length) % arr.length]; }
  function chance(p) { return random() < p; }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // shortest-arc angle lerp, for steering and cameras
  function lerpAngle(a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  function angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function dist2d(ax, az, bx, bz) {
    const dx = ax - bx, dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  CH.setSeed = setSeed;
  CH.random = random;
  CH.range = range;
  CH.randi = randi;
  CH.pick = pick;
  CH.chance = chance;
  CH.clamp = clamp;
  CH.lerp = lerp;
  CH.lerpAngle = lerpAngle;
  CH.angleDiff = angleDiff;
  CH.dist2d = dist2d;
})();
