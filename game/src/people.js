// Coral Heat — people: one low-poly articulated figure builder shared by the player and the
// pedestrians, plus the pedestrian brain (stroll the sidewalks, flee from trouble, fall when
// shot — they fade out and are quietly replaced, no gore in Coral Bay).
window.CH = window.CH || {};

(function () {
  const SKIN = [0xf2c79b, 0xc68863, 0x8a5a3b, 0xffe0bd];
  const SHIRTS = [0xff6b4a, 0x3d8b84, 0xffc94d, 0xf2ede4, 0x5b84ae, 0xf9e2e4, 0x7fb069, 0xe2725b];
  const PANTS = [0x35424e, 0x74604a, 0xf2ede4, 0x2b4a67, 0x8a8f7a];

  // A ~1.75 m figure: legs and arms pivot at hip/shoulder so a walk cycle is just sine waves.
  function makePerson(opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: opts.skin || CH.pick(SKIN) });
    const shirt = new THREE.MeshLambertMaterial({ color: opts.shirt || CH.pick(SHIRTS) });
    const pants = new THREE.MeshLambertMaterial({ color: opts.pants || CH.pick(PANTS) });
    function part(w, h, d, mat, x, y, z, parent) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true;
      (parent || g).add(m); return m;
    }
    function limb(w, h, d, mat, x, y, z) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      part(w, h, d, mat, 0, -h / 2, 0, pivot);
      g.add(pivot);
      return pivot;
    }
    const legL = limb(0.17, 0.78, 0.19, pants, -0.12, 0.8, 0);
    const legR = limb(0.17, 0.78, 0.19, pants, 0.12, 0.8, 0);
    part(0.46, 0.62, 0.26, shirt, 0, 1.11, 0);                       // torso
    const armL = limb(0.13, 0.68, 0.15, shirt, -0.31, 1.38, 0);
    const armR = limb(0.13, 0.68, 0.15, shirt, 0.31, 1.38, 0);
    part(0.3, 0.34, 0.3, skin, 0, 1.6, 0);                           // head
    if (opts.cap !== false && CH.chance(0.45)) {
      part(0.36, 0.09, 0.36, new THREE.MeshLambertMaterial({ color: CH.pick(SHIRTS) }), 0, 1.79, 0);
    }
    const person = { group: g, legL, legR, armL, armR, walkPhase: Math.random() * 6 };
    g.userData.person = person;
    return person;
  }

  function animateWalk(p, speedNorm, dt) {
    p.walkPhase += dt * (4 + speedNorm * 7);
    const s = Math.sin(p.walkPhase) * (0.25 + speedNorm * 0.45);
    p.legL.rotation.x = s; p.legR.rotation.x = -s;
    p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = s * 0.8;
  }
  function animateIdle(p) {
    p.legL.rotation.x *= 0.8; p.legR.rotation.x *= 0.8;
    p.armL.rotation.x *= 0.8; p.armR.rotation.x *= 0.8;
  }
  function animateFall(p, t) {
    // t: 0..1 — tip over backwards and sink slightly
    p.group.rotation.x = -Math.min(1, t * 1.6) * Math.PI / 2;
    p.group.position.y = -Math.max(0, t - 0.6) * 0.8;
  }

  // ---- pedestrians ----
  function makePedestrian(world, scene) {
    const person = makePerson();
    const seg = CH.pick(world.sidewalkSegs);
    const ped = {
      person, group: person.group, seg,
      t: CH.random(), dir: CH.chance(0.5) ? 1 : -1,
      speed: CH.range(1.1, 1.9), state: 'stroll', fleeT: 0, fleeFrom: null,
      dead: false, deadT: 0, radius: 0.55,
    };
    placeOnSeg(ped);
    scene.add(ped.group);
    return ped;
  }
  function placeOnSeg(ped) {
    const s = ped.seg;
    ped.group.position.set(
      s.ax + (s.bx - s.ax) * ped.t, 0.22,
      s.az + (s.bz - s.az) * ped.t);
    const heading = Math.atan2((s.bx - s.ax) * ped.dir, (s.bz - s.az) * ped.dir);
    ped.group.rotation.y = heading;
  }
  function updatePedestrian(ped, dt, world, threat) {
    const pos = ped.group.position;
    if (ped.dead) {
      ped.deadT += dt;
      animateFall(ped.person, ped.deadT);
      return ped.deadT > 2.6; // true -> ready to recycle
    }
    // flee if a threat is close (gunfire, a car on the sidewalk, a chase)
    if (threat && CH.dist2d(pos.x, pos.z, threat.x, threat.z) < 13) {
      ped.state = 'flee'; ped.fleeT = 2.6; ped.fleeFrom = threat;
    }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const away = Math.atan2(pos.x - ped.fleeFrom.x, pos.z - ped.fleeFrom.z);
      ped.group.rotation.y = CH.lerpAngle(ped.group.rotation.y, away, dt * 8);
      pos.x += Math.sin(ped.group.rotation.y) * 4.6 * dt;
      pos.z += Math.cos(ped.group.rotation.y) * 4.6 * dt;
      CH.collideWorld(world, pos, ped.radius);
      pos.y = 0.22;
      animateWalk(ped.person, 1, dt);
      if (ped.fleeT <= 0) { ped.state = 'stroll'; placeSnap(ped); }
      return false;
    }
    // stroll along the segment, turn around at the ends
    const s = ped.seg;
    const segLen = CH.dist2d(s.ax, s.az, s.bx, s.bz);
    ped.t += (ped.speed * ped.dir * dt) / segLen;
    if (ped.t > 1) { ped.t = 1; ped.dir = -1; }
    if (ped.t < 0) { ped.t = 0; ped.dir = 1; }
    placeOnSeg(ped);
    animateWalk(ped.person, 0.4, dt);
    return false;
  }
  function placeSnap(ped) { /* after fleeing, adopt nearest segment afresh */ 
    ped.t = CH.clamp(ped.t, 0, 1); placeOnSeg(ped);
  }
  function killPedestrian(ped) {
    if (ped.dead) return;
    ped.dead = true; ped.deadT = 0;
  }
  function revivePedestrian(ped, world) {
    ped.dead = false; ped.deadT = 0; ped.state = 'stroll';
    ped.group.rotation.x = 0;
    ped.seg = CH.pick(world.sidewalkSegs);
    ped.t = CH.random();
    placeOnSeg(ped);
  }

  CH.makePerson = makePerson;
  CH.animateWalk = animateWalk;
  CH.animateIdle = animateIdle;
  CH.makePedestrian = makePedestrian;
  CH.updatePedestrian = updatePedestrian;
  CH.killPedestrian = killPedestrian;
  CH.revivePedestrian = revivePedestrian;
})();
