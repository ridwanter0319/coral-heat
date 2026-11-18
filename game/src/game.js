// game.js — Coral Heat's main loop and glue. Owns the game state (health,
// cash, wanted, ammo), input, the third-person and chase cameras, pistol
// combat, the wanted/police pressure system, BUSTED / WASTED endings,
// localStorage saves, and the deterministic ?shot= staging used to render
// the store screenshots from this exact code.
(function () {
  'use strict';

  const R = window.CH.rng;
  const AudioSys = window.CH.audio;
  const SAVE_KEY = 'coral-heat-save-v1';
  const SPAWN = { x: 12, z: 96, heading: Math.PI };

  // --- boot / query -------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const shotMode = params.get('shot');
  const seed = parseInt(params.get('seed') || (shotMode ? '1' : '1337'), 10) || 1337;
  R.resetWorldRng(seed);

  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

  const city = window.CH.city.build(scene);
  const beacon = window.CH.missions.buildBeacon(scene);
  const hud = window.CH.hud.createHud();

  // --- world actors ---------------------------------------------------------
  const playerFig = window.CH.people.buildPlayerFigure();
  playerFig.group.position.set(SPAWN.x, 0, SPAWN.z);
  playerFig.group.rotation.y = SPAWN.heading;
  scene.add(playerFig.group);

  const parkedCars = window.CH.cars.spawnParkedCars(scene, city, 14);
  const trafficCars = window.CH.cars.spawnTrafficCars(scene, city, 10);
  const pedestrians = window.CH.people.spawnPedestrians(scene, city, 22);
  const policeCars = [];

  const flashLight = new THREE.PointLight(0xffc46b, 0, 18);
  scene.add(flashLight);

  // --- state ------------------------------------------------------------------
  const missionState = window.CH.missions.createMissionState();
  const state = {
    mode: 'menu', // menu | playing | paused | ended
    health: 100,
    cash: 0,
    wanted: 0,
    ammo: 12,
    reserve: 48,
    reloading: 0,
    inCar: null,
    speedKmh: 0,
    playerHeading: SPAWN.heading,
    walkPhase: 0,
    camYaw: SPAWN.heading + Math.PI,
    camPitch: 0.32,
    crimeHeat: 0, // seconds since last witnessed crime
    hideTime: 0, // seconds no police has been close
    bustedMeter: 0,
    lastHurt: -99,
    shotCooldown: 0,
    flashTime: 0,
    carCrimeCooldown: 0,
    endKind: null,
    time: 0,
  };

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.cash === 'number' && typeof data.stage === 'number') return data;
    } catch (e) { /* corrupted save: start fresh */ }
    return null;
  }

  function persist() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: state.cash, stage: missionState.stage }));
    } catch (e) { /* private mode: play session-only */ }
  }

  const save = loadSave();
  if (save) {
    state.cash = save.cash;
    window.CH.missions.beginStage(missionState, Math.min(save.stage, window.CH.missions.CHAIN.length));
    const btn = document.getElementById('continue-btn');
    if (btn) btn.style.display = 'block';
  } else {
    window.CH.missions.beginStage(missionState, 0);
  }

  // --- input --------------------------------------------------------------------
  const keys = {};
  let mouseDownLeft = false;
  let wantShoot = false;

  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyF' || e.code === 'KeyE') toggleCar();
    if (e.code === 'Escape' && state.mode === 'playing') pauseGame();
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });

  canvas.addEventListener('mousedown', function (e) {
    if (state.mode !== 'playing') return;
    if (e.button === 0) { mouseDownLeft = true; wantShoot = true; }
    if (document.pointerLockElement !== canvas && !shotMode) canvas.requestPointerLock();
  });
  window.addEventListener('mouseup', function (e) {
    if (e.button === 0) mouseDownLeft = false;
  });
  window.addEventListener('mousemove', function (e) {
    if (document.pointerLockElement !== canvas || state.mode !== 'playing') return;
    state.camYaw -= e.movementX * 0.0026;
    state.camPitch = R.clamp(state.camPitch + e.movementY * 0.0022, -0.15, 1.1);
  });
  document.addEventListener('pointerlockchange', function () {
    if (document.pointerLockElement !== canvas && state.mode === 'playing' && !shotMode) pauseGame();
  });
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- screens --------------------------------------------------------------------
  function show(id) {
    ['start-screen', 'pause-screen', 'end-screen'].forEach(function (s) {
      document.getElementById(s).style.display = s === id ? 'flex' : 'none';
    });
    hud.root.style.display = id === null ? 'block' : (id === 'start-screen' ? 'none' : 'block');
  }

  function startGame(fresh) {
    if (fresh) {
      state.cash = 0;
      window.CH.missions.beginStage(missionState, 0);
      persist();
    }
    resetPlayerToSpawn();
    state.mode = 'playing';
    show(null);
    AudioSys.ensureContext();
    AudioSys.startAmbience();
    const m = window.CH.missions.currentMission(missionState);
    if (m) window.CH.hud.showBanner(hud, m.title, m.intro, 4.2);
    if (!shotMode) canvas.requestPointerLock();
  }

  function pauseGame() {
    if (state.mode !== 'playing') return;
    state.mode = 'paused';
    show('pause-screen');
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    AudioSys.setEngine(false, 0);
    AudioSys.setSiren(false);
  }

  function resumeGame() {
    state.mode = 'playing';
    show(null);
    if (!shotMode) canvas.requestPointerLock();
  }

  function endGame(kind) {
    state.mode = 'ended';
    state.endKind = kind;
    if (kind === 'busted') {
      const fine = Math.min(150, state.cash);
      state.cash -= fine;
      document.getElementById('end-title').textContent = 'BUSTED';
      document.getElementById('end-sub').textContent =
        'Coral Bay PD pinned you down. Fine paid: $' + fine + '. Your fixer bails you out by morning.';
    } else {
      document.getElementById('end-title').textContent = 'WASTED';
      document.getElementById('end-sub').textContent =
        'You wake up at Coral Bay General, lighter one hospital bill and all of your dignity.';
    }
    persist();
    show('end-screen');
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    AudioSys.setEngine(false, 0);
    AudioSys.setSiren(false);
  }

  function resetPlayerToSpawn() {
    if (state.inCar) exitCar(true);
    state.health = 100;
    state.wanted = 0;
    state.bustedMeter = 0;
    state.ammo = 12;
    state.reserve = 48;
    clearPolice();
    playerFig.group.visible = true;
    playerFig.group.position.set(SPAWN.x, 0, SPAWN.z);
    state.playerHeading = SPAWN.heading;
    state.camYaw = SPAWN.heading + Math.PI;
  }

  document.getElementById('start-btn').addEventListener('click', function () { AudioSys.playClick(); startGame(true); });
  document.getElementById('continue-btn').addEventListener('click', function () { AudioSys.playClick(); startGame(false); });
  document.getElementById('resume-btn').addEventListener('click', function () { AudioSys.playClick(); resumeGame(); });
  document.getElementById('restart-btn').addEventListener('click', function () { AudioSys.playClick(); startGame(false); });
  document.getElementById('again-btn').addEventListener('click', function () { AudioSys.playClick(); startGame(false); });

  // --- cars: enter / exit ---------------------------------------------------------
  function nearestCar(maxDist) {
    const p = playerFig.group.position;
    let best = null;
    let bestD = maxDist;
    parkedCars.concat(trafficCars).forEach(function (car) {
      const d = R.distance2D(p.x, p.z, car.pos.x, car.pos.z);
      if (d < bestD) { bestD = d; best = car; }
    });
    return best;
  }

  function toggleCar() {
    if (state.mode !== 'playing') return;
    if (state.inCar) exitCar(false);
    else enterCar();
  }

  function enterCar() {
    const car = nearestCar(3.6);
    if (!car) return;
    // Stealing is a crime if anyone is around to see it.
    const witnessed = policeCars.length > 0 || pedestrians.some(function (p) {
      return !p.dead && R.distance2D(p.pos.x, p.pos.z, car.pos.x, car.pos.z) < 16;
    });
    if (car.driver === 'traffic' || witnessed) commitCrime(1, car.pos.x, car.pos.z);
    car.driver = 'player';
    const ti = trafficCars.indexOf(car);
    if (ti >= 0) trafficCars.splice(ti, 1);
    state.inCar = car;
    playerFig.group.visible = false;
    AudioSys.playClick();
  }

  function exitCar(silent) {
    const car = state.inCar;
    if (!car) return;
    car.driver = null;
    car.speed = 0;
    if (!parkedCars.includes(car)) parkedCars.push(car);
    state.inCar = null;
    const side = new THREE.Vector3(car.pos.x + Math.cos(car.heading) * 2.2, 0, car.pos.z - Math.sin(car.heading) * 2.2);
    city.collide(side, 0.5);
    playerFig.group.position.copy(side);
    playerFig.group.visible = true;
    AudioSys.setEngine(false, 0);
    if (!silent) AudioSys.playClick();
  }

  // --- crime & wanted ----------------------------------------------------------------
  function commitCrime(stars, x, z) {
    state.wanted = Math.min(5, Math.max(state.wanted, state.wanted + (stars > 0 ? 1 : 0)));
    if (stars > 1) state.wanted = Math.min(5, state.wanted + stars - 1);
    state.crimeHeat = 0;
    state.hideTime = 0;
    window.CH.people.scarePeds(pedestrians, x, z, 20, state.time);
  }

  function clearPolice() {
    policeCars.forEach(function (car) { scene.remove(car.mesh); });
    policeCars.length = 0;
  }

  function policeSpawnPoint() {
    const p = state.inCar ? state.inCar.pos : playerFig.group.position;
    const angle = R.randRange(0, Math.PI * 2);
    const dist = R.randRange(58, 78);
    const pos = new THREE.Vector3(p.x + Math.sin(angle) * dist, 0, p.z + Math.cos(angle) * dist);
    // Snap to the nearest road intersection area so they arrive by street.
    let bx = city.avenuesX[0];
    city.avenuesX.forEach(function (a) { if (Math.abs(a - pos.x) < Math.abs(bx - pos.x)) bx = a; });
    let bz = city.streetsZ[0];
    city.streetsZ.concat([city.coastZ]).forEach(function (s) { if (Math.abs(s - pos.z) < Math.abs(bz - pos.z)) bz = s; });
    pos.x = bx;
    pos.z = R.clamp(bz, -190, 100);
    return pos;
  }

  function managePolice(dt) {
    const want = state.wanted === 0 ? 0 : Math.min(6, state.wanted + 1);
    if (policeCars.length < want) {
      const sp = policeSpawnPoint();
      policeCars.push(window.CH.cars.spawnPoliceCar(scene, sp.x, sp.z));
    } else if (policeCars.length > want) {
      const car = policeCars.pop();
      scene.remove(car.mesh);
    }
    AudioSys.setSiren(policeCars.length > 0 && state.mode === 'playing');
  }

  // --- combat ----------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const tracers = [];

  function startReload() {
    if (state.inCar || state.reloading > 0 || state.ammo >= 12 || state.reserve <= 0) return;
    state.reloading = 1.1;
    AudioSys.playClick();
  }

  function finishReload() {
    const take = Math.min(12 - state.ammo, state.reserve);
    state.ammo += take;
    state.reserve -= take;
  }

  function shoot() {
    if (state.ammo <= 0) {
      AudioSys.playClick();
      startReload();
      return;
    }
    state.ammo -= 1;
    AudioSys.playGunshot();
    state.flashTime = 0.06;
    playerFig.gun.visible = true;

    const origin = playerFig.group.position.clone();
    origin.y = 1.5;
    // Aim: from the camera through the crosshair.
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const dir = raycaster.ray.direction.clone();
    const maxDist = 70;
    let hitPoint = origin.clone().add(dir.clone().multiplyScalar(maxDist));
    let bestT = maxDist;

    pedestrians.forEach(function (p) {
      if (p.dead) return;
      const to = p.pos.clone(); to.y = 1.1;
      const t = to.clone().sub(origin).dot(dir);
      if (t < 0 || t > bestT) return;
      const closest = origin.clone().add(dir.clone().multiplyScalar(t));
      if (closest.distanceTo(to) < 1.0) {
        bestT = t;
        hitPoint = closest;
        window.CH.people.knockDownPed(p);
        commitCrime(1, p.pos.x, p.pos.z);
        window.CH.hud.showToast(hud, 'Pedestrian down! Wanted level up.');
      }
    });

    parkedCars.concat(trafficCars, policeCars).forEach(function (car) {
      const to = car.pos.clone(); to.y = 0.8;
      const t = to.clone().sub(origin).dot(dir);
      if (t < 0 || t > bestT) return;
      const closest = origin.clone().add(dir.clone().multiplyScalar(t));
      if (closest.distanceTo(to) < 1.9) {
        bestT = t;
        hitPoint = closest;
        car.health -= 12;
        if (car.isPolice) commitCrime(1, car.pos.x, car.pos.z);
      }
    });

    // Tracer line that fades almost immediately.
    const geo = new THREE.BufferGeometry().setFromPoints([
      origin.clone().add(new THREE.Vector3(Math.sin(state.playerHeading) * 0.4, 0.05, Math.cos(state.playerHeading) * 0.4)),
      hitPoint,
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    scene.add(line);
    tracers.push({ line, life: 0.07 });

    flashLight.position.copy(origin).add(dir.clone().multiplyScalar(1.2));
    flashLight.intensity = 2.4;
    commitCrime(0, origin.x, origin.z); // gunfire itself panics the block
    if (state.wanted === 0) state.wanted = 1;
  }

  // --- damage --------------------------------------------------------------------------------
  function hurtPlayer(amount) {
    state.health -= amount;
    state.lastHurt = state.time;
    AudioSys.playThud();
    if (state.health <= 0) {
      state.health = 0;
      endGame('wasted');
    }
  }

  // --- per-frame update -------------------------------------------------------------------------
  function updatePlayerOnFoot(dt) {
    const p = playerFig.group.position;
    let ix = 0;
    let iz = 0;
    if (keys.KeyW || keys.ArrowUp) iz += 1;
    if (keys.KeyS || keys.ArrowDown) iz -= 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    const moving = ix !== 0 || iz !== 0;
    const sprint = keys.ShiftLeft || keys.ShiftRight;
    const speed = sprint ? 8.4 : 4.6;

    if (moving) {
      const len = Math.sqrt(ix * ix + iz * iz);
      ix /= len; iz /= len;
      // Movement is relative to the camera yaw: forward is the direction
      // the camera looks, right is that turned ninety degrees.
      const fx = -Math.sin(state.camYaw);
      const fz = -Math.cos(state.camYaw);
      const rx = Math.cos(state.camYaw);
      const rz = -Math.sin(state.camYaw);
      const moveX = fx * iz + rx * ix;
      const moveZ = fz * iz + rz * ix;
      p.x += moveX * speed * dt;
      p.z += moveZ * speed * dt;
      state.playerHeading = Math.atan2(moveX, moveZ);
      state.walkPhase += dt * (sprint ? 13 : 9);
    }
    city.collide(p, 0.5);
    playerFig.group.position.copy(p);
    // When aiming/shooting the figure faces the camera's forward;
    // otherwise it faces where it walks.
    playerFig.group.rotation.y = (mouseDownLeft || state.flashTime > 0)
      ? state.camYaw + Math.PI
      : state.playerHeading;
    window.CH.people.poseWalk(playerFig, state.walkPhase, moving ? 1 : 0, mouseDownLeft);
    playerFig.gun.visible = mouseDownLeft || state.flashTime > 0;

    // Camera: orbit behind the player.
    const dist = 6.4;
    const camTarget = new THREE.Vector3(
      p.x + Math.sin(state.camYaw) * Math.cos(state.camPitch) * dist,
      p.y + 1.6 + Math.sin(state.camPitch) * dist,
      p.z + Math.cos(state.camYaw) * Math.cos(state.camPitch) * dist
    );
    camera.position.lerp(camTarget, shotMode ? 1 : Math.min(1, dt * 10));
    camera.lookAt(p.x, p.y + 1.7, p.z);
    return moving && sprint;
  }

  function updateDriving(dt) {
    const car = state.inCar;
    const input = {
      throttle: !!(keys.KeyW || keys.ArrowUp),
      brake: !!(keys.KeyS || keys.ArrowDown),
      steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (keys.KeyD || keys.ArrowRight ? -1 : 0),
      handbrake: !!keys.Space,
    };
    const beforeSpeed = car.speed;
    state.speedKmh = window.CH.cars.drivePlayerCar(car, input, dt, city);
    if (car.crunched) {
      car.crunched = false;
      AudioSys.playThud();
      if (Math.abs(beforeSpeed) > 12) {
        hurtPlayer(4);
        commitCrime(1, car.pos.x, car.pos.z);
      }
    }
    AudioSys.setEngine(true, Math.abs(car.speed) / 30);

    // Chase camera behind the car, mouse can orbit it.
    const back = 9.5;
    const camTarget = new THREE.Vector3(
      car.pos.x - Math.sin(car.heading) * back,
      car.pos.y + 3.6,
      car.pos.z - Math.cos(car.heading) * back
    );
    if (document.pointerLockElement === canvas) {
      camTarget.set(
        car.pos.x + Math.sin(state.camYaw) * Math.cos(state.camPitch) * back,
        car.pos.y + 1.8 + Math.sin(state.camPitch) * back,
        car.pos.z + Math.cos(state.camYaw) * Math.cos(state.camPitch) * back
      );
    }
    camera.position.lerp(camTarget, shotMode ? 1 : Math.min(1, dt * 6));
    camera.lookAt(car.pos.x, car.pos.y + 1.4, car.pos.z);
    state.playerHeading = car.heading;
    return Math.abs(car.speed) > 14;
  }

  function updateMissions(dt) {
    const target = window.CH.missions.currentTarget(missionState);
    window.CH.missions.updateBeacon(beacon, target, state.time);
    if (!target || state.mode !== 'playing') return;
    const p = state.inCar ? state.inCar.pos : playerFig.group.position;
    if (R.distance2D(p.x, p.z, target.x, target.z) < 3.4) {
      const ev = window.CH.missions.reachTarget(missionState);
      if (!ev) return;
      if (ev.type === 'pickup') {
        window.CH.hud.showBanner(hud, 'Package secured', ev.mission.title + ' — now move!', 3);
        if (ev.wanted) { state.wanted = Math.min(5, Math.max(state.wanted, ev.wanted)); state.crimeHeat = 0; }
        AudioSys.playCashBlip();
      } else if (ev.type === 'drop') {
        state.cash += 150;
        window.CH.hud.showToast(hud, 'Cash drop collected! $150 — ' + ev.left + ' to go');
        AudioSys.playCashBlip();
        persist();
      } else if (ev.type === 'complete') {
        state.cash += ev.reward;
        AudioSys.playCashBlip();
        persist();
        if (ev.chainDone) {
          window.CH.hud.showBanner(hud, 'Chain complete!', 'Marisol: You are officially trouble. Free roam unlocked — +$' + ev.reward, 4.5);
        } else {
          window.CH.hud.showBanner(hud, ev.mission.title + ' complete! +$' + ev.reward, ev.next.intro, 4.2);
        }
      }
    }
  }

  function updateWanted(dt) {
    state.crimeHeat += dt;
    const p = state.inCar ? state.inCar.pos : playerFig.group.position;
    let nearestPolice = 1e9;
    policeCars.forEach(function (car) {
      const d = R.distance2D(p.x, p.z, car.pos.x, car.pos.z);
      if (d < nearestPolice) nearestPolice = d;
    });
    if (nearestPolice > 55 && state.crimeHeat > 6) state.hideTime += dt;
    else state.hideTime = 0;
    if (state.wanted > 0 && state.hideTime > 9) {
      state.wanted -= 1;
      state.hideTime = 0;
      if (state.wanted === 0) window.CH.hud.showToast(hud, 'You lost the heat.');
    }

    // BUSTED pressure: close police + barely moving.
    const playerSpeed = state.inCar ? Math.abs(state.inCar.speed) : 0;
    const pinned = nearestPolice < 5 && (state.inCar ? playerSpeed < 2 : true) && state.wanted > 0;
    if (pinned && state.mode === 'playing') {
      state.bustedMeter += dt;
      if (state.bustedMeter > 1.6) endGame('busted');
    } else {
      state.bustedMeter = Math.max(0, state.bustedMeter - dt * 1.5);
    }
  }

  function updatePolice(dt) {
    const target = state.inCar ? state.inCar.pos : playerFig.group.position;
    policeCars.forEach(function (car) {
      const dist = window.CH.cars.updatePoliceCar(car, dt, target, city, state.wanted);
      // Ram damage.
      if (dist < 3.1 && Math.abs(car.speed) > 7) {
        if (state.inCar) {
          if (state.carCrimeCooldown <= 0) {
            state.carCrimeCooldown = 0.9;
            state.inCar.speed *= 0.55;
            hurtPlayer(3);
          }
        } else if (dist < 2.3) {
          hurtPlayer(16);
          const push = new THREE.Vector3(
            playerFig.group.position.x + Math.sin(car.heading) * 3,
            0,
            playerFig.group.position.z + Math.cos(car.heading) * 3
          );
          city.collide(push, 0.5);
          playerFig.group.position.copy(push);
          car.speed *= 0.3;
        }
      }
    });
    // Strobe the light bars.
    const phase = Math.floor(state.time * 6) % 2 === 0;
    policeCars.forEach(function (car) {
      car.mesh.userData.redMat.color.setHex(phase ? 0xff2222 : 0x551111);
      car.mesh.userData.blueMat.color.setHex(phase ? 0x113355 : 0x2266ff);
    });
  }

  function updateTrafficAndPeds(dt, speeding) {
    const obstacles = trafficCars.concat(policeCars);
    if (state.inCar) obstacles.push(state.inCar);
    trafficCars.forEach(function (car) {
      window.CH.cars.updateTrafficCar(car, dt, city, obstacles);
    });
    window.CH.people.updatePedestrians(pedestrians, dt, state.time, city);
    // Cars vs pedestrians: a fast car knocks a ped down (and it's a crime).
    const allCars = trafficCars.concat(policeCars);
    if (state.inCar) allCars.push(state.inCar);
    pedestrians.forEach(function (p) {
      if (p.dead) return;
      for (let i = 0; i < allCars.length; i++) {
        const car = allCars[i];
        if (Math.abs(car.speed) > 6 && R.distance2D(p.pos.x, p.pos.z, car.pos.x, car.pos.z) < 1.9) {
          window.CH.people.knockDownPed(p);
          if (car === state.inCar) {
            commitCrime(1, p.pos.x, p.pos.z);
            window.CH.hud.showToast(hud, 'You hit a pedestrian!');
            hurtPlayer(0); // no self damage, just the crime
            state.health = Math.min(100, state.health); // keep HUD sane
          }
          break;
        }
      }
      // Peds also shy away from a fast-approaching player car.
      if (speeding && state.inCar) window.CH.people.scarePeds(pedestrians, state.inCar.pos.x, state.inCar.pos.z, 9, state.time);
    });
  }

  // --- screenshot staging -------------------------------------------------------------
  function stageShot(name) {
    state.mode = 'playing';
    show(null);
    const m = window.CH.missions.currentMission(missionState);
    if (name === 'vista') {
      camera.position.set(-96, 34, 196);
      camera.lookAt(30, 2, -60);
      state.camYaw = Math.PI;
    } else if (name === 'foot') {
      playerFig.group.position.set(10.5, 0, 66);
      state.playerHeading = -0.5;
      state.camYaw = 2.6;
      state.camPitch = 0.3;
    } else if (name === 'chase') {
      const car = parkedCars[0];
      car.pos.set(2.8, 0, 26);
      car.heading = Math.PI;
      car.mesh.rotation.y = Math.PI;
      car.speed = 13;
      car.driver = 'player';
      state.inCar = car;
      playerFig.group.visible = false;
      state.wanted = 3;
      state.speedKmh = 47;
      const p1 = window.CH.cars.spawnPoliceCar(scene, -3.4, 20);
      const p2 = window.CH.cars.spawnPoliceCar(scene, 3.2, 37);
      p1.heading = Math.PI; p2.heading = Math.PI;
      p1.mesh.rotation.y = Math.PI; p2.mesh.rotation.y = Math.PI;
      policeCars.push(p1, p2);
      state.camYaw = 0;
    } else if (name === 'mission') {
      playerFig.group.position.set(-72, 0, -52);
      state.playerHeading = -2.55;
      state.camYaw = 0.59;
      state.camPitch = 0.3;
      if (m) window.CH.hud.showBanner(hud, m.title, m.intro, 999);
    }
    hud.root.style.display = 'block';
  }

  // --- main loop ---------------------------------------------------------------------------
  const clock = new THREE.Clock();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    state.time += dt;
    city.update(state.time);

    if (state.mode === 'playing') {
      state.carCrimeCooldown = Math.max(0, state.carCrimeCooldown - dt);
      if (state.reloading > 0) {
        state.reloading -= dt;
        if (state.reloading <= 0) finishReload();
      }
      if (state.shotCooldown > 0) state.shotCooldown -= dt;
      if (wantShoot && !state.inCar && state.shotCooldown <= 0) {
        shoot();
        state.shotCooldown = 0.22;
      }
      wantShoot = mouseDownLeft && !state.inCar;

      let speeding = false;
      if (!shotMode) {
        if (state.inCar) speeding = updateDriving(dt);
        else updatePlayerOnFoot(dt);
        updatePolice(dt);
      } else if (shotMode === 'chase') {
        // Hold the staged chase composition; wheels + lights still live.
        const car = state.inCar;
        camera.position.set(car.pos.x - 9.5, 5.4, car.pos.z + 13.5);
        camera.lookAt(car.pos.x + 1.5, 1.0, car.pos.z - 10);
        const phase = Math.floor(state.time * 6) % 2 === 0;
        policeCars.forEach(function (pc) {
          pc.mesh.userData.redMat.color.setHex(phase ? 0xff2222 : 0x551111);
          pc.mesh.userData.blueMat.color.setHex(phase ? 0x113355 : 0x2266ff);
        });
      } else if (shotMode === 'foot' || shotMode === 'mission') {
        updatePlayerOnFoot(0); // pose + camera at staged yaw, no movement
      } else if (shotMode === 'vista') {
        camera.position.set(-96, 34, 196);
        camera.lookAt(30, 2, -60);
      }

      if (!shotMode || shotMode !== 'chase') {
        updateTrafficAndPeds(dt, speeding);
      }
      if (!shotMode) {
        managePolice(dt);
        updateWanted(dt);
      }
      updateMissions(dt);

      if (state.flashTime > 0) {
        state.flashTime -= dt;
        if (state.flashTime <= 0) {
          flashLight.intensity = 0;
          playerFig.gun.visible = mouseDownLeft;
        }
      }
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) {
          scene.remove(tracers[i].line);
          tracers.splice(i, 1);
        }
      }
      // Slow health regen when things have been calm.
      if (state.time - state.lastHurt > 6 && state.health > 0 && state.health < 100) {
        state.health = Math.min(100, state.health + dt * 2.2);
      }

      const hudState = {
        health: state.health,
        cash: state.cash,
        wanted: state.wanted,
        ammo: state.ammo,
        reserve: state.reserve,
        reloading: state.reloading > 0,
        inCar: !!state.inCar,
        speedKmh: state.speedKmh,
        objective: window.CH.missions.objectiveText(missionState),
        missionTitle: (window.CH.missions.currentMission(missionState) || { title: 'Free Roam' }).title,
      };
      window.CH.hud.updateHud(hud, hudState, dt);
      window.CH.hud.drawMinimap(hud, {
        city,
        traffic: trafficCars,
        police: policeCars,
        target: window.CH.missions.currentTarget(missionState),
        playerPos: state.inCar ? state.inCar.pos : playerFig.group.position,
        playerHeading: Math.PI - (state.inCar ? state.inCar.heading : state.playerHeading),
        time: state.time,
      });
    }

    renderer.render(scene, camera);
  }

  // --- go ---------------------------------------------------------------------------------------
  if (shotMode) {
    stageShot(shotMode);
  } else {
    show('start-screen');
  }
  frame();

  // Small debug/QA surface (also used by the screenshot harness).
  window.__coralHeat = { state, missionState, scene, camera, renderer, policeCars, parkedCars, trafficCars };
})();
