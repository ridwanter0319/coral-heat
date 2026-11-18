// hud.js — the on-screen layer: health / cash / wanted stars / ammo,
// objective banner, vehicle speed readout, toast messages, and the
// circular minimap drawn on a 2D canvas (roads, player arrow, police,
// traffic, pedestrians skipped for clarity, mission blip pulsing gold).
(function () {
  'use strict';

  const R = window.CH.rng;

  function el(id) {
    return document.getElementById(id);
  }

  function createHud() {
    const hud = {
      root: el('hud'),
      healthFill: el('health-fill'),
      cash: el('cash-value'),
      stars: el('wanted-stars'),
      ammo: el('ammo-value'),
      weapon: el('weapon-name'),
      objective: el('objective-text'),
      missionTitle: el('mission-title'),
      speedBox: el('speed-box'),
      speed: el('speed-value'),
      toast: el('toast'),
      banner: el('banner'),
      bannerTitle: el('banner-title'),
      bannerSub: el('banner-sub'),
      minimap: el('minimap'),
      toastTimer: 0,
      bannerTimer: 0,
    };
    hud.mapCtx = hud.minimap ? hud.minimap.getContext('2d') : null;
    return hud;
  }

  function showToast(hud, text, seconds) {
    if (!hud.toast) return;
    hud.toast.textContent = text;
    hud.toast.classList.add('show');
    hud.toastTimer = seconds || 2.6;
  }

  function showBanner(hud, title, sub, seconds) {
    if (!hud.banner) return;
    hud.bannerTitle.textContent = title;
    hud.bannerSub.textContent = sub || '';
    hud.banner.classList.add('show');
    hud.bannerTimer = seconds || 3.4;
  }

  function updateHud(hud, state, dt) {
    if (hud.toastTimer > 0) {
      hud.toastTimer -= dt;
      if (hud.toastTimer <= 0) hud.toast.classList.remove('show');
    }
    if (hud.bannerTimer > 0) {
      hud.bannerTimer -= dt;
      if (hud.bannerTimer <= 0) hud.banner.classList.remove('show');
    }
    hud.healthFill.style.width = Math.max(0, Math.min(100, state.health)) + '%';
    hud.healthFill.style.background = state.health > 35 ? '#3ddc74' : '#e74c3c';
    hud.cash.textContent = '$' + state.cash.toLocaleString('en-US');
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
    hud.stars.textContent = stars;
    hud.stars.style.opacity = state.wanted > 0 ? '1' : '0.35';
    hud.weapon.textContent = state.inCar ? '—' : 'PISTOL';
    hud.ammo.textContent = state.inCar ? '' : state.ammo + ' / ' + state.reserve;
    if (state.reloading) hud.ammo.textContent += ' …';
    hud.objective.textContent = state.objective;
    hud.missionTitle.textContent = state.missionTitle || '';
    if (state.inCar) {
      hud.speedBox.classList.add('show');
      hud.speed.textContent = Math.round(state.speedKmh);
    } else {
      hud.speedBox.classList.remove('show');
    }
  }

  // --- minimap ---------------------------------------------------------------
  // World spans roughly -200..200 on both axes; the map is a square canvas
  // with north up. Roads are drawn from the same grid constants the city
  // builder used, so the map always matches the streets.
  const WORLD = 210;

  function worldToMap(canvas, x, z) {
    const s = canvas.width / (WORLD * 2);
    return [canvas.width / 2 + x * s, canvas.height / 2 + z * s];
  }

  function drawMinimap(hud, view) {
    const ctx = hud.mapCtx;
    if (!ctx) return;
    const canvas = hud.minimap;
    const W = canvas.width;
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = '#20242e';
    ctx.fillRect(0, 0, W, W);

    // Sea + beach strip at the south edge.
    const seaY = worldToMap(canvas, 0, view.city.seaStart)[1];
    ctx.fillStyle = '#2e7ea6';
    ctx.fillRect(0, seaY, W, W - seaY);
    const sandY = worldToMap(canvas, 0, view.city.sandStart)[1];
    ctx.fillStyle = '#eed9a4';
    ctx.fillRect(0, sandY, W, seaY - sandY);

    // Roads.
    ctx.strokeStyle = '#565d6e';
    ctx.lineWidth = Math.max(2, W * 0.02);
    ctx.beginPath();
    view.city.avenuesX.forEach(function (x) {
      const a = worldToMap(canvas, x, -WORLD);
      const b = worldToMap(canvas, x, view.city.coastZ);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    });
    view.city.streetsZ.concat([view.city.coastZ]).forEach(function (z) {
      const a = worldToMap(canvas, -WORLD, z);
      const b = worldToMap(canvas, WORLD, z);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    });
    ctx.stroke();

    function dot(x, z, color, size) {
      const p = worldToMap(canvas, x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p[0], p[1], size, 0, Math.PI * 2);
      ctx.fill();
    }

    view.traffic.forEach(function (car) {
      dot(car.pos.x, car.pos.z, '#c8ccd4', 2);
    });
    view.police.forEach(function (car) {
      dot(car.pos.x, car.pos.z, '#ff5252', 3);
    });

    // Mission blip: pulsing gold ring.
    if (view.target) {
      const p = worldToMap(canvas, view.target.x, view.target.z);
      const pulse = 5 + Math.sin(view.time * 5) * 1.6;
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p[0], p[1], pulse, 0, Math.PI * 2);
      ctx.stroke();
      dot(view.target.x, view.target.z, '#ffd23e', 2.6);
    }

    // Player arrow, rotated to facing.
    const pp = worldToMap(canvas, view.playerPos.x, view.playerPos.z);
    ctx.save();
    ctx.translate(pp[0], pp[1]);
    ctx.rotate(view.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  window.CH = window.CH || {};
  window.CH.hud = { createHud, showToast, showBanner, updateHud, drawMinimap };
})();
