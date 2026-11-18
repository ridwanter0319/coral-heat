// Coral Heat — the HUD: health, cash, wanted stars, objective line, vehicle readout, toasts,
// mission banners, and the corner minimap (roads, player arrow, police, traffic, markers).
window.CH = window.CH || {};

CH.createHUD = function () {
  const $ = (id) => document.getElementById(id);
  const hud = $('hud'), healthbar = $('healthbar'), cashEl = $('cash'), ammoEl = $('ammo'),
    starsEl = $('stars'), objEl = $('objective'), vehEl = $('vehicle'),
    bannerEl = $('banner'), toastEl = $('toast'), vigEl = $('vignette'),
    crossEl = $('crosshair');
  const mapCtx = $('minimap').getContext('2d');
  let bannerTimer = null, toastTimer = null;

  starsEl.innerHTML = '';
  const starSpans = [];
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('span');
    s.textContent = '★';
    starsEl.appendChild(s); starSpans.push(s);
  }

  function show() { hud.classList.add('on'); }
  function hide() { hud.classList.remove('on'); }
  function setHealth(pct) {
    healthbar.style.width = CH.clamp(pct, 0, 100) + '%';
    healthbar.style.background = pct < 30
      ? 'linear-gradient(90deg,#e33,#f66)' : 'linear-gradient(90deg,#37d67a,#a6e34d)';
  }
  function setCash(n) { cashEl.innerHTML = '$' + n.toLocaleString('en-US') + ' <small>CASH</small>'; }
  function setAmmo(cur, mag, reloading) {
    ammoEl.textContent = reloading ? 'RELOADING…' : ('PISTOL ' + cur + ' / ' + mag);
  }
  function setStars(n) {
    starSpans.forEach((s, i) => s.className = i < n ? 'lit' : '');
  }
  function setObjective(html) { objEl.innerHTML = html; }
  function setVehicle(name, kmh) {
    if (name == null) { vehEl.style.display = 'none'; return; }
    vehEl.style.display = 'block';
    vehEl.querySelector('.vname').textContent = name;
    vehEl.querySelector('.vspeed').innerHTML = Math.round(kmh) + ' <small>KM/H</small>';
  }
  function setCrosshair(on) { crossEl.style.display = on ? 'block' : 'none'; }
  function banner(title, sub) {
    bannerEl.querySelector('.btitle').textContent = title;
    bannerEl.querySelector('.bsub').textContent = sub || '';
    bannerEl.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), 3400);
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }
  function setVignette(op) { vigEl.style.opacity = op; }

  // ---- minimap ----
  const MW = 188, WORLD_MIN = -172, WORLD_MAX = 196; // z runs further south (the sea)
  function mx(x) { return ((x - WORLD_MIN) / (WORLD_MAX - WORLD_MIN)) * MW; }
  function mz(z) { return ((z - WORLD_MIN) / (WORLD_MAX - WORLD_MIN)) * MW; }
  function drawMinimap(world, view) {
    const g = mapCtx;
    g.clearRect(0, 0, MW, MW);
    // sea + sand + land
    g.fillStyle = '#27586b'; g.fillRect(0, 0, MW, MW);
    g.fillStyle = '#7d8471'; g.fillRect(mx(-172), mz(-172), mx(172) - mx(-172), mz(150) - mz(-172));
    g.fillStyle = '#ecd29a'; g.fillRect(mx(-172), mz(128), mx(172) - mx(-172), mz(152) - mz(128));
    g.fillStyle = '#1f7f96'; g.fillRect(mx(-172), mz(150), mx(172) - mx(-172), MW - mz(150));
    // roads
    g.strokeStyle = '#454b52'; g.lineWidth = 3;
    world.AX.forEach((x) => { g.beginPath(); g.moveTo(mx(x), mz(-150)); g.lineTo(mx(x), mz(120)); g.stroke(); });
    world.SZ.concat([120]).forEach((z) => { g.beginPath(); g.moveTo(mx(-150), mz(z)); g.lineTo(mx(150), mz(z)); g.stroke(); });
    // traffic
    g.fillStyle = '#c8ccd2';
    view.traffic.forEach((c) => { g.fillRect(mx(c.x) - 1.5, mz(c.z) - 1.5, 3, 3); });
    // cash drops
    g.fillStyle = '#51ff7a';
    view.drops.forEach((d) => { g.beginPath(); g.arc(mx(d.x), mz(d.z), 3, 0, 7); g.fill(); });
    // mission marker (pulsing gold)
    if (view.marker) {
      const r = 4.5 + Math.sin(Date.now() / 240) * 1.4;
      g.fillStyle = '#ffc94d';
      g.beginPath(); g.arc(mx(view.marker.x), mz(view.marker.z), r, 0, 7); g.fill();
      g.strokeStyle = '#fff3c4'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(mx(view.marker.x), mz(view.marker.z), r, 0, 7); g.stroke();
    }
    // police
    view.police.forEach((c) => {
      g.fillStyle = (Math.sin(Date.now() / 130) > 0) ? '#ff4444' : '#4488ff';
      g.beginPath(); g.arc(mx(c.x), mz(c.z), 3.4, 0, 7); g.fill();
    });
    // player arrow
    const px = mx(view.player.x), pz = mz(view.player.z), h = view.player.heading;
    g.save();
    g.translate(px, pz); g.rotate(Math.PI - h); // map y grows with world z; heading 0 faces +Z (down-map)
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6.5); g.lineTo(4.4, 5); g.lineTo(0, 2.6); g.lineTo(-4.4, 5); g.closePath(); g.fill();
    g.strokeStyle = '#14202b'; g.lineWidth = 1.2; g.stroke();
    g.restore();
  }

  return {
    show, hide, setHealth, setCash, setAmmo, setStars, setObjective, setVehicle,
    setCrosshair, banner, toast, setVignette, drawMinimap,
  };
};
