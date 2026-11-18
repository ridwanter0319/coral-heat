// Coral Heat — the story: three jobs for fixer Lena Voss, then the bay is yours.
// Dario Solano owes Lena money; each job pays a chunk of it off and makes the CBPD angrier.
// Missions are a small state machine over world markers (a gold beacon you can see across
// town and a blip on the minimap). After the chain, endless paid errands keep free roam fed.
window.CH = window.CH || {};

CH.createMissions = function (scene, hooks) {
  // marker beacon: a column of gold light + a ring on the ground
  const beacon = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 30, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
  );
  column.position.y = 15;
  beacon.add(column);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.3, 0.16, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xffc94d })
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.35;
  beacon.add(ring);
  beacon.visible = false;
  scene.add(beacon);

  // cash drop props for mission 3
  const dropMat = new THREE.MeshBasicMaterial({ color: 0x51ff7a });
  const drops = [];
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), dropMat);
    d.visible = false; scene.add(d); drops.push(d);
  }

  const SPOTS = {
    pickup: { x: 133, z: 133 },        // the pier boardwalk, east end
    garage: { x: -128.6, z: -80 },     // Marina Garage, north-west
    hideout: { x: 63.4, z: -63.4 },    // Uncle Ray's garage
    drops: [
      { x: -15.4, z: -32.6 },
      { x: 80.6, z: 32.6 },
      { x: -80.6, z: 63.4 },
    ],
    errands: [
      { x: 128.6, z: 15.4 }, { x: -32.6, z: -128.6 }, { x: 15.4, z: 80.6 },
      { x: -128.6, z: 111.4 }, { x: 111.4, z: -32.6 }, { x: -63.4, z: 32.6 },
    ],
  };

  let stage = 0;         // 0,1,2 = story jobs; 3 = cash drops; 4 = free roam errands
  let dropCount = 0;
  let errandIdx = 0;
  let started = false;

  function target() {
    if (stage === 0) return SPOTS.pickup;
    if (stage === 1) return SPOTS.garage;
    if (stage === 2) return null; // drops instead
    if (stage === 3) return SPOTS.hideout;
    return SPOTS.errands[errandIdx % SPOTS.errands.length];
  }
  function objective() {
    switch (stage) {
      case 0: return '<b>Job 1 · Package Deal:</b> pick up Lena\'s package at the <b>pier boardwalk</b>, east end of the bay.';
      case 1: return '<b>Job 2 · Hot Goods:</b> the drop was watched — deliver the package to the <b>Marina Garage</b>, north-west corner.';
      case 2: return '<b>Job 3 · Cash Rain:</b> grab Lena\'s cash drops around town — <b>' + dropCount + ' / 3</b> collected.';
      case 3: return '<b>Job 3 · Cash Rain:</b> now get the money to <b>Uncle Ray\'s garage</b> and you\'re square.';
      default: return '<b>Free roam.</b> Coral Bay is yours — run the parcel to the <b>gold marker</b> for $150, or just enjoy the sunset.';
    }
  }

  function placeBeacon() {
    const t = target();
    if (t) { beacon.visible = true; beacon.position.set(t.x, 0, t.z); }
    else beacon.visible = false;
    drops.forEach((d, i) => {
      d.visible = stage === 2 && !d.userData.taken;
      if (d.visible) d.position.set(SPOTS.drops[i].x, 0.8, SPOTS.drops[i].z);
    });
  }

  function start(atStage) {
    stage = atStage || 0;
    dropCount = 0;
    drops.forEach((d) => { d.userData.taken = false; });
    started = true;
    placeBeacon();
    hooks.setObjective(objective());
  }

  function completeStage() {
    if (stage === 0) {
      hooks.addCash(250);
      hooks.banner('PACKAGE COLLECTED', '+$250 — one debt shrinks');
      stage = 1;
      hooks.addHeat(2); // the drop was watched: police are alerted for the delivery
    } else if (stage === 1) {
      hooks.addCash(600);
      hooks.banner('DELIVERED', '+$600 — Lena is almost smiling');
      stage = 2;
    } else if (stage === 3) {
      hooks.addCash(900);
      hooks.banner('SQUARE WITH LENA', '+$900 — the bay is yours now');
      stage = 4;
      hooks.onStoryComplete();
    } else if (stage === 4) {
      hooks.addCash(150);
      hooks.toast('+$150 — errand run');
      errandIdx++;
    }
    placeBeacon();
    hooks.setObjective(objective());
    hooks.save();
  }

  let pulse = 0;
  function update(dt, ctx) {
    if (!started) return;
    pulse += dt;
    ring.scale.setScalar(1 + Math.sin(pulse * 4) * 0.12);
    column.material.opacity = 0.26 + Math.sin(pulse * 4) * 0.08;
    drops.forEach((d) => { if (d.visible) d.rotation.y += dt * 2.4; });
    const p = ctx.playerPos;
    if (stage === 2) {
      drops.forEach((d, i) => {
        if (d.visible && CH.dist2d(p.x, p.z, SPOTS.drops[i].x, SPOTS.drops[i].z) < 3.4) {
          d.userData.taken = true; d.visible = false;
          dropCount++;
          hooks.cashPickup();
          hooks.toast('Cash drop ' + dropCount + ' / 3');
          if (dropCount >= 3) { stage = 3; placeBeacon(); }
          hooks.setObjective(objective());
          hooks.save();
        }
      });
      return;
    }
    const t = target();
    if (t && CH.dist2d(p.x, p.z, t.x, t.z) < 4.6) completeStage();
  }

  return {
    start, update,
    get stage() { return stage; },
    markerPos: target,
    dropsActive: () => (stage === 2 ? SPOTS.drops.filter((d, i) => !drops[i].userData.taken) : []),
    objective,
  };
};
