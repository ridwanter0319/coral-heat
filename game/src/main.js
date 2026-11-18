// Coral Heat — main: boots the city, runs the loop, and owns the game state — Dario on foot
// or behind a wheel, the pistol, the CBPD wanted system, busted/wasted, saving, and the
// deterministic ?shot= scenes used to render the entry's screenshots.
(function () {
  const params = new URLSearchParams(location.search);
  const SHOT = params.get('shot');
  const SEED = parseInt(params.get('seed') || '7', 10) || 7;
  CH.setSeed(SEED);

  const app = document.getElementById('app');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.getElementById('startScreen').innerHTML = '<h2>WebGL is not available in this browser.</h2>';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.className = 'webgl';
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 900);
  camera.position.set(60, 40, 170);
  camera.lookAt(0, 0, -10); // menu backdrop: the bay at golden hour

  const world = CH.WORLD.build(scene);
  const hud = CH.createHUD();

  // ---------------- state ----------------
  const S = {
    mode: 'menu',            // menu | playing | paused | ended
    frozen: !!SHOT,          // shot scenes hold still for the camera
    onFoot: true,
    cash: 0,
    health: 100,
    lastHurt: -99,
    wanted: 0,               // in "stars", float; displayed ceil()
    unseenT: 0,
    bustT: 0,
    ammo: 12, reloading: 0,
    time: 0,
    saveT: 0,
  };
  const starsShown = () => (S.wanted <= 0.02 ? 0 : Math.min(5, Math.ceil(S.wanted)));

  // ---------------- player ----------------
  const playerPerson = CH.makePerson({ shirt: 0x0e7f86, pants: 0x27313b, skin: 0xc68863, cap: true });
  const player = {
    person: playerPerson, group: playerPerson.group,
    heading: Math.PI, speed: 0, radius: 0.55,
    get x() { return this.group.position.x; },
    get z() { return this.group.position.z; },
  };
  player.group.position.set(world.playerStart.x, 0.22, world.playerStart.z);
  player.group.rotation.y = player.heading;
  scene.add(player.group);
  // Dario's pistol, glued to his right hand
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x22262a }));
  gun.position.set(0, -0.72, 0.16);
  playerPerson.armR.add(gun);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  flash.position.set(0, -0.72, 0.45);
  playerPerson.armR.add(flash);
  const flashLight = new THREE.PointLight(0xffc36b, 0, 16);
  scene.add(flashLight);

  // ---------------- vehicles & people ----------------
  const parkedCars = [];
  world.parkedSpots.forEach((s) => {
    const style = CH.pick(CH.STYLES.slice(0, 6));
    const car = CH.makeCar(style, style.id === 'taxi' ? 0xffc94d : CH.pick(CH.CAR_COLORS));
    car.group.position.set(s.x, 0, s.z);
    car.heading = s.heading; car.parked = true;
    CH.syncCar(car, 0);
    scene.add(car.group);
    parkedCars.push(car);
  });
  const trafficCars = [];
  for (let i = 0; i < 12; i++) trafficCars.push(CH.makeTraffic(world, scene));
  const policeCars = [];
  const peds = [];
  for (let i = 0; i < 24; i++) peds.push(CH.makePedestrian(world, scene));
  let playerCar = null;

  function allCars() {
    const list = parkedCars.concat(trafficCars, policeCars);
    if (playerCar && !list.includes(playerCar)) list.push(playerCar);
    return list;
  }

  // ---------------- missions & save ----------------
  const SAVE_KEY = 'coralHeatSaveV1';
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: S.cash, stage: missions.stage,
      }));
    } catch (e) { /* private mode etc. — saving is a bonus, never fatal */ }
  }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  const missions = CH.createMissions(scene, {
    addCash(n) { S.cash += n; hud.setCash(S.cash); CH.Audio.cash(); },
    toast(m) { hud.toast(m); },
    banner(t, s) { hud.banner(t, s); },
    addHeat(n) { addWanted(n); },
    setObjective(h) { hud.setObjective(h); },
    cashPickup() { CH.Audio.cash(); },
    onStoryComplete() { save(); },
    save,
  });

  // ---------------- wanted ----------------
  function addWanted(n) {
    S.wanted = CH.clamp(S.wanted + n, 0, 5);
    S.unseenT = 0;
  }
  function crimeAt(x, z, stars) {
    // a crime only counts if someone could see it: a pedestrian or officer nearby
    let seen = policeCars.length > 0;
    if (!seen) {
      for (const p of peds) {
        if (!p.dead && CH.dist2d(p.group.position.x, p.group.position.z, x, z) < 26) { seen = true; break; }
      }
    }
    if (seen) addWanted(stars);
  }
  function updateWanted(dt) {
    const stars = starsShown();
    const pp = playerCar ? playerCar.group.position : player.group.position;
    // spawn/despawn police to match the level
    const want = stars === 0 ? 0 : Math.min(5, stars + 1);
    if (policeCars.length < want && S.time > (updateWanted.nextSpawn || 0)) {
      policeCars.push(CH.makePolice(world, scene, pp));
      updateWanted.nextSpawn = S.time + 2.5;
    }
    while (policeCars.length > want) {
      const c = policeCars.pop();
      scene.remove(c.group);
    }
    // sight & decay
    let seen = false;
    for (const c of policeCars) {
      if (CH.dist2d(c.group.position.x, c.group.position.z, pp.x, pp.z) < 46) { seen = true; break; }
    }
    if (seen) S.unseenT = 0; else S.unseenT += dt;
    if (S.unseenT > 6 && S.wanted > 0) {
      S.wanted = Math.max(0, S.wanted - dt * 0.14);
    }
    hud.setStars(stars);
    CH.Audio.siren(policeCars.length > 0 && stars > 0);
    if (policeCars.length) CH.Audio.sirenTick(dt);
  }

  // ---------------- damage / endings ----------------
  function hurt(n) {
    if (S.mode !== 'playing') return;
    S.health -= n;
    S.lastHurt = S.time;
    hud.setVignette(0.85);
    if (S.health <= 0) { S.health = 0; endGame(false); }
  }
  function endGame(busted) {
    S.mode = 'ended';
    document.exitPointerLock && document.exitPointerLock();
    const t = document.getElementById('endTitle');
    const sub = document.getElementById('endSub');
    const scr = document.getElementById('endScreen');
    if (busted) {
      const fine = Math.min(S.cash, 150);
      S.cash -= fine;
      t.textContent = 'BUSTED';
      scr.classList.remove('win');
      sub.textContent = 'The CBPD pinned Dario in Coral Bay. Fine paid: $' + fine + '. The summer goes on.';
    } else {
      const bill = Math.min(S.cash, 120);
      S.cash -= bill;
      t.textContent = 'WASTED';
      scr.classList.remove('win');
      sub.textContent = 'Dario wakes up at Coral Bay General, $' + bill + ' lighter and twice as stubborn.';
    }
    hud.setCash(S.cash);
    scr.classList.add('on');
    CH.Audio.engine(false, 0); CH.Audio.siren(false);
    save();
  }
  function respawn() {
    document.getElementById('endScreen').classList.remove('on');
    if (playerCar) exitCar(true);
    S.health = 100; S.wanted = 0; S.bustT = 0;
    while (policeCars.length) scene.remove(policeCars.pop().group);
    player.group.position.set(world.playerStart.x, 0.22, world.playerStart.z);
    player.heading = Math.PI;
    S.mode = 'playing';
    hud.setHealth(100); hud.setStars(0);
  }

  // ---------------- car entry ----------------
  function nearestCar(maxD) {
    let best = null, bd = maxD;
    allCars().forEach((c) => {
      if (c.isPolice) return;
      const d = CH.dist2d(c.group.position.x, c.group.position.z, player.x, player.z);
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  }
  function enterCar(car) {
    const wasParked = car.parked;
    const ti = trafficCars.indexOf(car);
    if (ti >= 0) trafficCars.splice(ti, 1);
    const pi = parkedCars.indexOf(car);
    if (pi >= 0) parkedCars.splice(pi, 1);
    car.parked = false;
    playerCar = car;
    S.onFoot = false;
    player.group.visible = false;
    camYaw = car.heading + Math.PI;
    if (wasParked) crimeAt(car.group.position.x, car.group.position.z, 1);   // grand theft auto
    else addWanted(1);                                                       // jacking is always seen
    hud.setVehicle(car.name, 0);
    document.getElementById('ammo').textContent = '';
    CH.Audio.click();
  }
  function exitCar(silent) {
    if (!playerCar) return;
    const car = playerCar;
    playerCar = null;
    car.parked = true; car.speed = 0;
    parkedCars.push(car);
    const side = 2.6;
    player.group.position.set(
      car.group.position.x + Math.cos(car.heading) * -side,
      0.22,
      car.group.position.z + Math.sin(car.heading) * side);
    // step out beside the car, then nudge out of any wall the door opened into
    CH.collideWorld(world, player.group.position, player.radius);
    player.group.visible = true;
    player.heading = car.heading;
    S.onFoot = true;
    hud.setVehicle(null);
    hud.setAmmo(S.ammo, 12, false);
    if (!silent) CH.Audio.click();
  }

  // ---------------- input ----------------
  const keys = {};
  let camYaw = Math.PI * 2, camPitch = 0.34, mouseIn = 0;
  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (S.mode === 'playing') {
      if (e.code === 'KeyF' || e.code === 'KeyE') {
        if (S.onFoot) { const c = nearestCar(3.6); if (c) enterCar(c); }
        else exitCar(false);
      }
      if (e.code === 'KeyR' && S.onFoot) startReload();
      if (e.code === 'Escape') pauseGame();
    } else if (S.mode === 'paused' && e.code === 'Escape') resumeGame();
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  function requestLock() {
    // requestPointerLock returns a promise in newer Chrome; a denial (no user
    // gesture, headless) must never surface as an unhandled rejection
    try {
      const p = renderer.domElement.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* pointer lock unavailable — mouse orbit still works unlocked */ }
  }
  renderer.domElement.addEventListener('click', () => {
    if (S.mode === 'playing' && !S.frozen && document.pointerLockElement !== renderer.domElement) {
      requestLock();
    }
  });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== renderer.domElement || S.mode !== 'playing') return;
    camYaw -= e.movementX * 0.0026;
    camPitch = CH.clamp(camPitch + e.movementY * 0.0022, -0.12, 1.05);
    mouseIn = S.time;
  });
  addEventListener('mousedown', (e) => {
    if (S.mode === 'playing' && !S.frozen && S.onFoot && e.button === 0 &&
        document.pointerLockElement === renderer.domElement) shoot();
  });
  addEventListener('contextmenu', (e) => e.preventDefault());

  function startReload() {
    if (S.reloading > 0 || S.ammo === 12) return;
    S.reloading = 1.1;
    CH.Audio.reload();
    hud.setAmmo(S.ammo, 12, true);
  }

  // ---------------- combat ----------------
  let threat = null, threatT = 0;   // what pedestrians are fleeing from, and for how long
  function shoot() {
    if (S.reloading > 0) { startReload(); return; }
    if (S.ammo <= 0) { startReload(); return; }
    S.ammo--;
    hud.setAmmo(S.ammo, 12, false);
    CH.Audio.shot();
    flash.material.opacity = 0.95;
    flashLight.position.copy(player.group.position).y += 1.4;
    flashLight.intensity = 2.4;
    threat = { x: player.x, z: player.z }; threatT = 1.6;
    crimeAt(player.x, player.z, 0.5);
    // ray from the camera through the crosshair
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let bestT = 70, bestPed = null, bestCar = null;
    function rayHit(cx, cy, cz, r) {
      const ox = cx - origin.x, oy = cy - origin.y, oz = cz - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > bestT) return;
      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      const d = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2 + (cz - pz) ** 2);
      if (d < r) bestT = t;
    }
    peds.forEach((p) => {
      if (p.dead) return;
      const before = bestT;
      rayHit(p.group.position.x, p.group.position.y + 1.0, p.group.position.z, 0.62);
      if (bestT < before) { bestPed = p; bestCar = null; }
    });
    allCars().forEach((c) => {
      const before = bestT;
      rayHit(c.group.position.x, 0.75, c.group.position.z, c.radius + 0.3);
      if (bestT < before) { bestCar = c; bestPed = null; }
    });
    if (bestPed) {
      CH.killPedestrian(bestPed);
      addWanted(0.5);
      hud.toast('You shot a pedestrian — the bay saw that.');
    } else if (bestCar) {
      bestCar.health -= 12;
      crimeAt(bestCar.group.position.x, bestCar.group.position.z, 0.34);
    }
    if (S.ammo === 0) startReload();
  }

  // ---------------- driving ----------------
  const CAR_MAX = { sedan: 30, hatch: 27, taxi: 30, roadster: 34, pickup: 28, van: 25, police: 34 };
  function updateDriving(dt) {
    const car = playerCar;
    const max = CAR_MAX[car.style.id] || 29;
    const fwd = (keys.KeyW || keys.ArrowUp) ? 1 : 0;
    const back = (keys.KeyS || keys.ArrowDown) ? 1 : 0;
    const steerIn = ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) - ((keys.KeyD || keys.ArrowRight) ? 1 : 0);
    if (fwd) car.speed += 15 * dt * (1 - Math.max(0, car.speed) / (max * 1.15));
    else if (back) car.speed -= (car.speed > 0.5 ? 26 : 8) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 3.2 * dt);
    if (keys.Space) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
    car.speed = CH.clamp(car.speed, -9, max);
    const sf = CH.clamp(Math.abs(car.speed) / 9, 0, 1) * Math.sign(car.speed);
    car.heading += steerIn * 1.65 * dt * sf * (keys.Space ? 1.35 : 1);
    car.wheels.forEach((w) => { if (w.front) w.steer.rotation.y = steerIn * 0.42; });
    const pos = car.group.position;
    pos.x += Math.sin(car.heading) * car.speed * dt;
    pos.z += Math.cos(car.heading) * car.speed * dt;
    const spd = Math.abs(car.speed);
    if (CH.collideWorld(world, pos, car.radius * 0.82)) {
      if (spd > 9) { hurt((spd - 8) * 0.55); CH.Audio.bump(); }
      car.speed *= -0.22;
    }
    // car vs car
    allCars().forEach((o) => {
      if (o === car) return;
      const d = CH.dist2d(pos.x, pos.z, o.group.position.x, o.group.position.z);
      const rr = car.radius + o.radius - 0.7;
      if (d < rr && d > 0.01) {
        const nx = (pos.x - o.group.position.x) / d, nz = (pos.z - o.group.position.z) / d;
        const push = (rr - d) / 2;
        pos.x += nx * push; pos.z += nz * push;
        o.group.position.x -= nx * push; o.group.position.z -= nz * push;
        if (spd > 6) {
          hurt((spd - 5) * 0.4);
          CH.Audio.bump();
          if (o.isPolice) addWanted(0.34);
          else crimeAt(pos.x, pos.z, 0.34);
          car.speed *= 0.45;
        } else car.speed *= 0.8;
      }
    });
    // running someone down is a crime, and Coral Bay notices
    if (spd > 3.5) {
      peds.forEach((p) => {
        if (p.dead) return;
        if (CH.dist2d(pos.x, pos.z, p.group.position.x, p.group.position.z) < car.radius + 0.4) {
          CH.killPedestrian(p);
          addWanted(1);
          car.speed *= 0.82;
          hud.toast('You ran someone down!');
        }
      });
    }
    CH.syncCar(car, dt);
    hud.setVehicle(car.name, Math.abs(car.speed) * 3.6);
    CH.Audio.engine(true, Math.abs(car.speed) / max);
    threat = spd > 7 ? { x: pos.x, z: pos.z } : threat;
    if (spd > 7) threatT = Math.max(threatT, 0.4);
  }

  // ---------------- on foot ----------------
  function updateFoot(dt) {
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const sprint = keys.ShiftLeft || keys.ShiftRight;
    const speed = sprint ? 7.2 : 4.3;
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    // camera sits at target + (sin,cos)*dist, so ground forward is (-sin,-cos)
    // and screen-right is (cos,-sin): move = forward*f + right*r
    const mx = -sin * f + cos * r;
    const mz = -cos * f - sin * r;
    const len = Math.sqrt(mx * mx + mz * mz);
    const pos = player.group.position;
    if (len > 0.01) {
      mx /= len; mz /= len;
      pos.x += mx * speed * dt;
      pos.z += mz * speed * dt;
      player.heading = CH.lerpAngle(player.heading, Math.atan2(mx, mz), dt * 12);
      player.speed = speed;
      CH.animateWalk(player.person, sprint ? 1 : 0.45, dt);
    } else {
      player.speed = 0;
      CH.animateIdle(player.person);
    }
    player.group.rotation.y = player.heading;
    CH.collideWorld(world, pos, player.radius);
    allCars().forEach((c) => {
      const d = CH.dist2d(pos.x, pos.z, c.group.position.x, c.group.position.z);
      const rr = c.radius + player.radius - 0.5;
      if (d < rr && d > 0.01) {
        pos.x += ((pos.x - c.group.position.x) / d) * (rr - d);
        pos.z += ((pos.z - c.group.position.z) / d) * (rr - d);
      }
    });
    pos.y = 0.22;
    // aim pose: right arm up with the pistol while playing on foot
    playerPerson.armR.rotation.x = -1.25 - (camPitch - 0.34) * 0.6;
    CH.Audio.engine(false, 0);
  }

  // ---------------- police & bust ----------------
  function updatePolice(dt) {
    const target = playerCar
      ? { x: playerCar.group.position.x, z: playerCar.group.position.z, heading: playerCar.heading, speed: playerCar.speed }
      : { x: player.x, z: player.z, heading: player.heading, speed: 0 };
    const maxSpeed = 15 + starsShown() * 0.9;
    policeCars.forEach((c) => CH.updatePolice(c, dt, world, target, maxSpeed));
    // bust check: pinned on foot by a nearby unit while hardly moving
    if (S.onFoot && starsShown() > 0) {
      let near = false;
      for (const c of policeCars) {
        if (CH.dist2d(c.group.position.x, c.group.position.z, player.x, player.z) < 4.6) { near = true; break; }
      }
      if (near && player.speed < 2.4) {
        S.bustT += dt;
        hud.setVignette(0.3 + S.bustT * 0.25);
        if (S.bustT > 2.2) { endGame(true); return; }
      } else S.bustT = Math.max(0, S.bustT - dt * 2);
    }
  }

  // ---------------- camera ----------------
  function updateCamera(dt) {
    const target = playerCar ? playerCar.group.position : player.group.position;
    const driving = !!playerCar;
    const dist = driving ? 10.6 : 7.4;
    if (driving && S.time - mouseIn > 2.2) {
      camYaw = CH.lerpAngle(camYaw, playerCar.heading + Math.PI, dt * 1.6);
    }
    const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
    const cx = target.x + Math.sin(camYaw) * cp * dist;
    const cz = target.z + Math.cos(camYaw) * cp * dist;
    const cy = target.y + 1.6 + sp * dist;
    const k = S.frozen ? 1 : 1 - Math.pow(0.0001, dt);
    camera.position.x = CH.lerp(camera.position.x, cx, k);
    camera.position.y = CH.lerp(camera.position.y, Math.max(1.1, cy), k);
    camera.position.z = CH.lerp(camera.position.z, cz, k);
    // keep the camera out of buildings: if the orbit point lands inside a
    // collider, push it out along the shallowest axis instead of clipping walls
    for (const c of world.colliders) {
      const m = 0.45, p = camera.position;
      if (p.x > c.minX - m && p.x < c.maxX + m && p.z > c.minZ - m && p.z < c.maxZ + m && p.y < 42) {
        const pl = p.x - (c.minX - m), pr = (c.maxX + m) - p.x;
        const pb = p.z - (c.minZ - m), pf = (c.maxZ + m) - p.z;
        const min = Math.min(pl, pr, pb, pf);
        if (min === pl) p.x = c.minX - m; else if (min === pr) p.x = c.maxX + m;
        else if (min === pb) p.z = c.minZ - m; else p.z = c.maxZ + m;
      }
    }
    camera.lookAt(target.x, target.y + 1.5, target.z);
    // sun shadow follows the action
    world.sun.position.set(target.x - 140, 95, target.z + 60);
    world.sun.target.position.set(target.x, 0, target.z);
  }

  // ---------------- screens ----------------
  function startGame(fromSave) {
    document.getElementById('startScreen').classList.remove('on');
    hud.show();
    S.mode = 'playing';
    CH.Audio.init(); CH.Audio.click(); CH.Audio.musicStart();
    if (fromSave) {
      const sv = loadSave();
      S.cash = sv.cash || 0;
      missions.start(Math.min(sv.stage || 0, 4));
      hud.toast('Welcome back, Dario.');
    } else {
      S.cash = 0;
      missions.start(0);
    }
    hud.setCash(S.cash);
    hud.setHealth(100);
    hud.setAmmo(S.ammo, 12, false);
    if (document.pointerLockElement !== renderer.domElement) requestLock();
  }
  function pauseGame() {
    if (S.mode !== 'playing') return;
    S.mode = 'paused';
    document.getElementById('pauseScreen').classList.add('on');
    document.exitPointerLock && document.exitPointerLock();
    CH.Audio.engine(false, 0);
  }
  function resumeGame() {
    document.getElementById('pauseScreen').classList.remove('on');
    S.mode = 'playing';
    CH.Audio.click();
  }
  document.getElementById('btnStart').addEventListener('click', () => startGame(false));
  document.getElementById('btnContinue').addEventListener('click', () => startGame(true));
  document.getElementById('btnResume').addEventListener('click', resumeGame);
  document.getElementById('btnRestart').addEventListener('click', () => {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    document.getElementById('pauseScreen').classList.remove('on');
    S.cash = 0; S.health = 100; S.wanted = 0;
    if (playerCar) exitCar(true);
    player.group.position.set(world.playerStart.x, 0.22, world.playerStart.z);
    missions.start(0);
    hud.setCash(0); hud.setHealth(100);
    S.mode = 'playing';
  });
  document.getElementById('btnAgain').addEventListener('click', respawn);
  if (loadSave()) document.getElementById('btnContinue').style.display = '';

  // ---------------- shot staging ----------------
  function stageShot(mode) {
    document.getElementById('startScreen').classList.remove('on');
    S.mode = 'playing';
    hud.show();
    missions.start(0);
    S.cash = 250; hud.setCash(250); hud.setHealth(100); hud.setAmmo(12, 12, false);
    if (mode === 'vista') {
      hud.hide();
      // from over the water: sea and beach in the foreground, the whole bay behind
      camera.position.set(55, 74, 302);
      camera.lookAt(-8, 2, -16);
      return 'vista';
    }
    if (mode === 'foot') {
      // west sidewalk of the avenue: open behind the camera, buildings across the street
      player.group.position.set(15.4, 0.22, 58);
      player.heading = 0.1;
      camYaw = player.heading + Math.PI; camPitch = 0.3;
      // a busy sidewalk: neighbours staged close, traffic rolling past on the avenue
      const spots = [[16.8, 64, 2.9], [14.2, 68, 0.4], [16.5, 76, 3.4], [15.0, 86, 2.2]];
      spots.forEach((s, i) => {
        if (peds[i]) { peds[i].group.position.set(s[0], 0.22, s[1]); peds[i].group.rotation.y = s[2]; }
      });
      stageTrafficCar(0, 20.6, 70, 0);
      stageTrafficCar(1, 27.4, 80, Math.PI);
      return 'foot';
    }
    if (mode === 'chase') {
      missions.start(1);
      const car = trafficCars[2];
      const ti = trafficCars.indexOf(car); trafficCars.splice(ti, 1);
      playerCar = car; S.onFoot = false;
      player.group.visible = false;
      car.group.position.set(-24, 0, 30);
      car.heading = 0; car.speed = 17;
      CH.syncCar(car, 0);
      player.group.position.set(-24, 0.22, 30);
      const p1 = CH.makePolice(world, scene, { x: 0, z: -999 }); // spawn point overridden below
      const p2 = CH.makePolice(world, scene, { x: 0, z: -999 });
      // flanking Dario's rear bumper, far enough ahead of the chase camera
      // that their bodies (not just roofs) stay in frame
      p1.group.position.set(-27.8, 0, 26.5); p1.heading = 0;
      p2.group.position.set(-20.6, 0, 26); p2.heading = 0.1;
      CH.syncCar(p1, 0); CH.syncCar(p2, 0);
      policeCars.push(p1, p2);
      stageTrafficCar(3, -20.6, 62, 0);
      S.wanted = 2.6;
      hud.setStars(3);
      hud.setVehicle(car.name, 61);
      hud.setCash(480); S.cash = 480;
      document.getElementById('ammo').textContent = '';
      camYaw = Math.PI; camPitch = 0.36;
      return 'chase';
    }
    if (mode === 'mission') {
      player.group.position.set(128.5, 0.22, 128.5);
      player.heading = Math.atan2(133 - 128.5, 133 - 128.5);
      camYaw = player.heading + Math.PI; camPitch = 0.32;
      stageTrafficCar(0, 116.6, 96, 0);
      return 'mission';
    }
    return null;
  }
  function stageTrafficCar(i, x, z, heading) {
    const c = trafficCars[i];
    if (!c) return;
    c.group.position.set(x, 0, z);
    c.heading = heading;
    c.speed = 0;
    CH.syncCar(c, 0);
  }
  const shotKind = SHOT ? stageShot(SHOT) : null;

  // ---------------- main loop ----------------
  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (S.mode === 'playing' && !S.frozen) {
      S.time += dt;
      threatT -= dt;
      if (threatT <= 0) threat = null;
      if (S.reloading > 0) {
        S.reloading -= dt;
        if (S.reloading <= 0) { S.ammo = 12; hud.setAmmo(12, 12, false); }
      }
      flash.material.opacity = Math.max(0, flash.material.opacity - dt * 9);
      flashLight.intensity = Math.max(0, flashLight.intensity - dt * 14);
      if (S.onFoot) updateFoot(dt); else updateDriving(dt);
      const obstacles = allCars();
      trafficCars.forEach((c) => CH.updateTraffic(c, dt, world, obstacles.concat([{ x: player.x, z: player.z }])));
      peds.forEach((p) => {
        if (CH.updatePedestrian(p, dt, world, threat)) CH.revivePedestrian(p, world);
      });
      updateWanted(dt);
      updatePolice(dt);
      missions.update(dt, { playerPos: playerCar ? playerCar.group.position : player.group.position });
      // gentle health regen once you've been out of trouble a while
      if (S.time - S.lastHurt > 5 && S.health > 0 && S.health < 100) {
        S.health = Math.min(100, S.health + dt * 5);
      }
      hud.setHealth(S.health);
      hud.setCrosshair(S.onFoot);
      hud.setAmmo(S.onFoot ? S.ammo : '', 12, S.reloading > 0);
      if (!S.onFoot) document.getElementById('ammo').textContent = '';
      S.saveT += dt;
      if (S.saveT > 5) { S.saveT = 0; save(); }
    }
    if (S.frozen) {
      // hold the staged scene; only the police lightbars and water move
      policeCars.forEach((c) => CH.syncCar(c, dt));
      if (playerCar) CH.syncCar(playerCar, 0);
      missions.update(0, { playerPos: { x: -9999, z: -9999 } });
    }
    world.update(dt);
    if (!shotKind || shotKind !== 'vista') updateCamera(dt);
    if (hudShown()) {
      hud.drawMinimap(world, {
        player: {
          x: playerCar ? playerCar.group.position.x : player.x,
          z: playerCar ? playerCar.group.position.z : player.z,
          heading: playerCar ? playerCar.heading : player.heading,
        },
        police: policeCars.map((c) => c.group.position),
        traffic: trafficCars.map((c) => c.group.position),
        marker: missions.markerPos(),
        drops: missions.dropsActive(),
      });
    }
    renderer.render(scene, camera);
  }
  function hudShown() { return document.getElementById('hud').classList.contains('on'); }
  frame();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
})();
