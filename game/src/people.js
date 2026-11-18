// people.js — low-poly human figures for Coral Heat: the player character
// (hoodie, cap, backpack) and the pedestrian crowd that strolls the
// sidewalks and bolts when a shot cracks or a car bears down on them.
(function () {
  'use strict';

  const R = window.CH.rng;

  const SKIN = [0xf2c89b, 0xc98d5f, 0x8a5a33, 0xffe0bd];
  const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0xfd79a8, 0x9b59b6, 0xecf0f1, 0x1abc9c];
  const PANTS = [0x2c3e50, 0x34495e, 0x7f8c8d, 0x5d4037, 0x16a085];

  // A simple articulated figure: torso, head, two arms, two legs, all boxes
  // on pivots so the walk cycle can swing limbs. Returns handles for posing.
  function buildFigure(shirtColor, pantsColor, skinColor) {
    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
    const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
    const skin = new THREE.MeshLambertMaterial({ color: skinColor });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), shirt);
    torso.position.y = 1.12;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), skin);
    head.position.y = 1.74;
    group.add(head);

    function limb(w, len, mat, x, y, z) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
      mesh.position.y = -len / 2;
      pivot.add(mesh);
      group.add(pivot);
      return pivot;
    }

    const armL = limb(0.16, 0.68, shirt, -0.4, 1.44, 0);
    const armR = limb(0.16, 0.68, shirt, 0.4, 1.44, 0);
    const legL = limb(0.2, 0.74, pants, -0.16, 0.74, 0);
    const legR = limb(0.2, 0.74, pants, 0.16, 0.74, 0);

    return { group, torso, head, armL, armR, legL, legR };
  }

  // Pose the figure for a walk cycle. phase advances with distance walked;
  // speedRatio 0 = idle sway, 1 = full stride.
  function poseWalk(fig, phase, speedRatio, aiming) {
    const swing = Math.sin(phase) * 0.65 * speedRatio;
    fig.legL.rotation.x = swing;
    fig.legR.rotation.x = -swing;
    if (aiming) {
      fig.armR.rotation.x = -Math.PI / 2 + 0.08;
      fig.armL.rotation.x = -Math.PI / 2 + 0.25;
      fig.armL.rotation.z = 0.25;
    } else {
      fig.armL.rotation.x = -swing * 0.8;
      fig.armR.rotation.x = swing * 0.8;
      fig.armL.rotation.z = 0;
    }
  }

  function buildPlayerFigure() {
    const fig = buildFigure(0xff7847, 0x27324a, 0xf2c89b);
    // Coral cap + brim.
    const capMat = new THREE.MeshLambertMaterial({ color: 0x14b8a6 });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.44), capMat);
    cap.position.y = 1.99;
    fig.group.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.3), capMat);
    brim.position.set(0, 1.94, 0.34);
    fig.group.add(brim);
    // Backpack.
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.56, 0.22),
      new THREE.MeshLambertMaterial({ color: 0xfacc15 })
    );
    pack.position.set(0, 1.16, -0.3);
    fig.group.add(pack);
    // Pistol, parented to the right arm pivot so aiming raises it.
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x22242a })
    );
    gun.position.set(0, -0.7, 0.18);
    gun.visible = false;
    fig.armR.add(gun);
    fig.gun = gun;
    return fig;
  }

  // --- pedestrians -------------------------------------------------------
  // Each ped walks a straight sidewalk leg between two waypoints, picks a
  // new leg at the end, and flees directly away from a danger point while
  // `panicUntil` is in the future.

  function spawnPedestrians(scene, city, count) {
    const peds = [];
    const walkZ = city.streetsZ.concat([city.coastZ]);
    for (let i = 0; i < count; i++) {
      const fig = buildFigure(R.pick(SHIRTS), R.pick(PANTS), R.pick(SKIN));
      const alongX = R.rand() < 0.5;
      const line = alongX ? R.pick(walkZ) : R.pick(city.avenuesX);
      const offset = (R.rand() < 0.5 ? -1 : 1) * (city.roadHalf + 2.2);
      const pos = new THREE.Vector3(
        alongX ? R.randRange(-185, 185) : line + offset,
        0,
        alongX ? line + offset : R.randRange(-185, 95)
      );
      fig.group.position.copy(pos);
      scene.add(fig.group);
      peds.push({
        fig,
        pos,
        alongX,
        dir: R.rand() < 0.5 ? 1 : -1,
        speed: R.randRange(1.6, 2.6),
        phase: R.randRange(0, 6),
        panicUntil: 0,
        fleeX: 0,
        fleeZ: 0,
        dead: false,
      });
    }
    return peds;
  }

  function scarePeds(peds, x, z, radius, now) {
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      if (p.dead) continue;
      if (R.distance2D(p.pos.x, p.pos.z, x, z) < radius) {
        p.panicUntil = now + R.randRange(1.6, 3.0);
        p.fleeX = p.pos.x - x;
        p.fleeZ = p.pos.z - z;
        const len = Math.sqrt(p.fleeX * p.fleeX + p.fleeZ * p.fleeZ) || 1;
        p.fleeX /= len;
        p.fleeZ /= len;
      }
    }
  }

  function updatePedestrians(peds, dt, now, city) {
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      if (p.dead) continue;
      let vx = 0;
      let vz = 0;
      let speedRatio = 1;
      if (now < p.panicUntil) {
        vx = p.fleeX * 5.2;
        vz = p.fleeZ * 5.2;
        speedRatio = 1.6;
      } else if (p.alongX) {
        vx = p.dir * p.speed;
        if (p.pos.x > 188) p.dir = -1;
        if (p.pos.x < -188) p.dir = 1;
      } else {
        vz = p.dir * p.speed;
        if (p.pos.z > 100) p.dir = -1;
        if (p.pos.z < -188) p.dir = 1;
      }
      p.pos.x += vx * dt;
      p.pos.z += vz * dt;
      city.collide(p.pos, 0.45);
      p.phase += dt * (4 + speedRatio * 4);
      p.fig.group.position.copy(p.pos);
      if (vx !== 0 || vz !== 0) {
        p.fig.group.rotation.y = Math.atan2(vx, vz);
      }
      poseWalk(p.fig, p.phase, Math.min(1, speedRatio), false);
    }
  }

  // A ped caught by a fast car topples (no gore — they just fall over and
  // fade out, then respawn elsewhere later via the main loop's timer).
  function knockDownPed(ped) {
    ped.dead = true;
    ped.fig.group.rotation.x = -Math.PI / 2;
    ped.fig.group.position.y = 0.25;
  }

  window.CH = window.CH || {};
  window.CH.people = {
    buildFigure,
    buildPlayerFigure,
    poseWalk,
    spawnPedestrians,
    scarePeds,
    updatePedestrians,
    knockDownPed,
  };
})();
