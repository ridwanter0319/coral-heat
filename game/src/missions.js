// missions.js — the Coral Heat story chain. Fixer "Marisol Vega" runs the
// player through three jobs: collect a package, move hot goods across
// town, then scoop cash drops along Ocean Drive before the trail goes
// cold. Each job is a glowing beacon in the world and a blip on the
// minimap; finishing the chain unlocks free roam.
(function () {
  'use strict';

  const R = window.CH.rng;

  const CHAIN = [
    {
      id: 'package-deal',
      title: 'Package Deal',
      intro: 'Marisol: A courier dropped a package behind the Coral Court hotel. Pick it up.',
      objective: 'Reach the package behind Coral Court',
      reward: 250,
      pickup: { x: -80, z: -64 },
      dropoff: null,
      wantedOnPickup: 1,
    },
    {
      id: 'hot-goods',
      title: 'Hot Goods',
      intro: 'Marisol: Good. Now get that package to the marina garage — and expect company.',
      objective: 'Deliver the package to the marina garage',
      reward: 600,
      pickup: null, // starts already carrying from mission 1's pickup point flow
      dropoff: { x: 120, z: 108 },
      wantedOnPickup: 2,
    },
    {
      id: 'cash-rain',
      title: 'Cash Rain',
      intro: 'Marisol: Last job. My driver panicked and scattered cash drops along Ocean Drive. Grab all three.',
      objective: 'Collect the cash drops on Ocean Drive',
      reward: 1200,
      drops: [
        { x: -140, z: 108 },
        { x: 0, z: 108 },
        { x: 140, z: 108 },
      ],
      wantedOnPickup: 2,
    },
  ];

  // Runtime state for whichever mission is live.
  function createMissionState() {
    return {
      stage: 0, // index into CHAIN; CHAIN.length = free roam
      phase: 'pickup', // 'pickup' | 'dropoff' | 'drops' | 'done'
      dropsLeft: [],
      beacon: null,
      beaconPos: null,
      complete: false,
    };
  }

  function currentMission(state) {
    return state.stage < CHAIN.length ? CHAIN[state.stage] : null;
  }

  // Where the player currently needs to go, or null in free roam.
  function currentTarget(state) {
    const m = currentMission(state);
    if (!m) return null;
    if (state.phase === 'pickup') return m.pickup;
    if (state.phase === 'dropoff') return m.dropoff;
    if (state.phase === 'drops') return state.dropsLeft[0] || null;
    return null;
  }

  function objectiveText(state) {
    const m = currentMission(state);
    if (!m) return 'Free roam — Coral Bay is yours.';
    if (state.phase === 'drops') {
      return m.objective + ' (' + state.dropsLeft.length + ' left)';
    }
    return m.objective;
  }

  // Start (or restart) a stage: reset phase, seed the drops list.
  function beginStage(state, stage) {
    state.stage = stage;
    state.complete = false;
    const m = currentMission(state);
    if (!m) {
      state.phase = 'done';
      state.dropsLeft = [];
      return null;
    }
    if (m.drops) {
      state.phase = 'drops';
      state.dropsLeft = m.drops.slice();
    } else if (m.pickup) {
      state.phase = 'pickup';
    } else {
      state.phase = 'dropoff';
    }
    return m;
  }

  // Called by the main loop when the player stands in the beacon.
  // Returns an event describing what happened, or null.
  function reachTarget(state) {
    const m = currentMission(state);
    if (!m) return null;
    if (state.phase === 'pickup') {
      state.phase = 'dropoff';
      if (!m.dropoff) {
        // Single-stop mission: pickup completes it.
        return finishStage(state, m);
      }
      return { type: 'pickup', mission: m, wanted: m.wantedOnPickup || 0 };
    }
    if (state.phase === 'dropoff') {
      return finishStage(state, m);
    }
    if (state.phase === 'drops') {
      state.dropsLeft.shift();
      if (state.dropsLeft.length === 0) return finishStage(state, m);
      return { type: 'drop', mission: m, left: state.dropsLeft.length, wanted: 0 };
    }
    return null;
  }

  function finishStage(state, m) {
    const reward = m.reward;
    state.stage += 1;
    const next = beginStage(state, state.stage);
    return {
      type: 'complete',
      mission: m,
      reward,
      next,
      chainDone: !next,
      wanted: 0,
    };
  }

  // --- beacon visuals ------------------------------------------------------
  function buildBeacon(scene) {
    const group = new THREE.Group();
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 30, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23e,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    cylinder.position.y = 15;
    group.add(cylinder);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    group.add(ring);
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.9),
      new THREE.MeshBasicMaterial({ color: 0xffe97a })
    );
    marker.position.y = 3.4;
    group.add(marker);
    group.visible = false;
    scene.add(group);
    return { group, marker, cylinder };
  }

  function updateBeacon(beacon, target, t) {
    if (!beacon) return;
    if (!target) {
      beacon.group.visible = false;
      return;
    }
    beacon.group.visible = true;
    beacon.group.position.set(target.x, 0, target.z);
    beacon.marker.position.y = 3.4 + Math.sin(t * 2.4) * 0.45;
    beacon.marker.rotation.y = t * 1.8;
    beacon.cylinder.material.opacity = 0.26 + Math.sin(t * 3) * 0.07;
  }

  window.CH = window.CH || {};
  window.CH.missions = {
    CHAIN,
    createMissionState,
    currentMission,
    currentTarget,
    objectiveText,
    beginStage,
    reachTarget,
    buildBeacon,
    updateBeacon,
  };
})();
