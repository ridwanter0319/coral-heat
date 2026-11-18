// Coral Heat — cars: low-poly procedural vehicles in a handful of invented Coral Bay styles,
// traffic that drives the road graph and brakes for trouble, and CBPD interceptors that hunt
// the player. Driving is pure arcade: steer toward a heading, speed follows throttle, and
// circles-vs-boxes keeps everything out of the buildings.
window.CH = window.CH || {};

CH.STYLES = [
  { id: 'sedan', name: 'Vireo Sedan', len: 4.4, wid: 1.9, h: 0.62, cabin: 0.5 },
  { id: 'hatch', name: 'Pico Hatch', len: 3.8, wid: 1.8, h: 0.66, cabin: 0.55 },
  { id: 'taxi', name: 'Sunset Cab', len: 4.4, wid: 1.9, h: 0.62, cabin: 0.5 },
  { id: 'roadster', name: 'Marlin Roadster', len: 4.1, wid: 1.85, h: 0.5, cabin: 0.34 },
  { id: 'pickup', name: 'Caballo Pickup', len: 4.8, wid: 2.0, h: 0.7, cabin: 0.55 },
  { id: 'van', name: 'Bronto Van', len: 4.7, wid: 2.0, h: 1.05, cabin: 0.8 },
  { id: 'police', name: 'CBPD Interceptor', len: 4.5, wid: 1.95, h: 0.6, cabin: 0.5 },
];
CH.CAR_COLORS = [0xff6b4a, 0xffc94d, 0x3d8b84, 0xf2ede4, 0x5b84ae, 0xe2725b, 0x7fb069, 0xb04a5e, 0x35424e, 0xf9e2e4];

(function () {
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2c38 });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x15181b });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xb9c0c7 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true;
    parent.add(m); return m;
  }

  // Build one car. Forward is +Z in local space; heading rotates the group.
  function makeCar(style, colorHex) {
    const g = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color: colorHex });
    const L = style.len, W = style.wid;
    box(W, style.h, L, paint, 0, 0.32 + style.h / 2, 0, g);                       // body
    box(W * 0.92, 0.16, L * 0.9, paint, 0, 0.36, 0, g);                            // skirt
    if (style.id === 'van') {
      box(W * 0.94, style.cabin, L * 0.86, paint, 0, 0.32 + style.h + style.cabin / 2, -L * 0.03, g);
      box(W * 0.9, 0.5, 0.1, glassMat, 0, 0.32 + style.h + 0.28, L * 0.4, g);
    } else if (style.id === 'pickup') {
      box(W * 0.9, style.cabin, L * 0.34, glassMat, 0, 0.32 + style.h + style.cabin / 2, L * 0.16, g);
      box(W * 0.94, 0.34, L * 0.42, paint, 0, 0.32 + style.h + 0.1, -L * 0.27, g); // bed walls hint
    } else if (style.id === 'roadster') {
      box(W * 0.86, style.cabin, L * 0.3, glassMat, 0, 0.32 + style.h + style.cabin / 2, -L * 0.02, g);
    } else {
      box(W * 0.88, style.cabin, L * 0.46, glassMat, 0, 0.32 + style.h + style.cabin / 2, -L * 0.04, g);
      box(W * 0.9, 0.09, L * 0.5, paint, 0, 0.32 + style.h + style.cabin + 0.02, -L * 0.04, g); // roof
    }
    if (style.id === 'taxi') {
      box(0.9, 0.24, 0.4, new THREE.MeshBasicMaterial({ color: 0xffc94d }), 0, 1.32, -0.2, g);
    }
    // lights
    box(0.34, 0.14, 0.06, lightMat, -W * 0.32, 0.62, L / 2 + 0.01, g);
    box(0.34, 0.14, 0.06, lightMat, W * 0.32, 0.62, L / 2 + 0.01, g);
    box(0.34, 0.12, 0.06, tailMat, -W * 0.32, 0.66, -L / 2 - 0.01, g);
    box(0.34, 0.12, 0.06, tailMat, W * 0.32, 0.66, -L / 2 - 0.01, g);
    // wheels: steer pivot (yaw) -> spin pivot (roll) -> tyre lying on its side
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
    const wheels = [];
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach((s) => {
      const steer = new THREE.Group();
      steer.position.set(s[0] * (W / 2 + 0.02), 0.36, s[1] * (L / 2 - 0.85));
      const spin = new THREE.Group();
      const w = new THREE.Mesh(wheelGeo, tyreMat);
      w.rotation.z = Math.PI / 2; w.castShadow = true;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 8), hubMat);
      hub.rotation.z = Math.PI / 2;
      spin.add(w); spin.add(hub);
      steer.add(spin);
      g.add(steer);
      wheels.push({ steer, spin, front: s[1] > 0 });
    });
    let lightBar = null;
    if (style.id === 'police') {
      const red = new THREE.MeshBasicMaterial({ color: 0xff2222 });
      const blue = new THREE.MeshBasicMaterial({ color: 0x2266ff });
      // sits proud of the roof slab (which tops out at y≈1.49) so the bar actually shows
      box(1.14, 0.08, 0.54, new THREE.MeshLambertMaterial({ color: 0x222222 }), 0, 1.53, -0.2, g);
      const r = box(0.5, 0.17, 0.5, red, -0.28, 1.65, -0.2, g);
      const b = box(0.5, 0.17, 0.5, blue, 0.28, 1.65, -0.2, g);
      lightBar = { red: r, blue: b };
    }
    const car = {
      group: g, style, name: style.name, colorHex,
      heading: 0, speed: 0, radius: Math.max(L, W) / 2 + 0.25,
      len: L, wid: W, wheels, lightBar, flashT: Math.random() * 10,
      isPolice: style.id === 'police', parked: false, driver: null,
      health: 100, cruise: 0, ai: null, dead: false,
    };
    g.userData.car = car;
    return car;
  }

  // push a circle (x,z,r) out of building AABBs and the city bounds; returns true on hit
  function collideWorld(world, pos, r) {
    let hit = false;
    const cols = world.colliders;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (pos.x > c.minX - r && pos.x < c.maxX + r && pos.z > c.minZ - r && pos.z < c.maxZ + r) {
        const dxl = pos.x - (c.minX - r), dxr = (c.maxX + r) - pos.x;
        const dzl = pos.z - (c.minZ - r), dzr = (c.maxZ + r) - pos.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) pos.x = c.minX - r; else if (m === dxr) pos.x = c.maxX + r;
        else if (m === dzl) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
        hit = true;
      }
    }
    const B = world.CITY;
    if (pos.x < B.minX) { pos.x = B.minX; hit = true; }
    if (pos.x > B.maxX) { pos.x = B.maxX; hit = true; }
    if (pos.z < B.minZ) { pos.z = B.minZ; hit = true; }
    if (pos.z > 178) { pos.z = 178; hit = true; }
    return hit;
  }

  function syncVisual(car, dt) {
    car.group.position.y = 0;
    car.group.rotation.y = car.heading;
    const spin = car.speed * dt / 0.36;
    car.wheels.forEach((w) => { w.spin.rotation.x += spin; });
    if (car.lightBar) {
      car.flashT += dt * 6;
      const on = Math.sin(car.flashT * 6) > 0;
      car.lightBar.red.material = on ? CH.MAT_FLASH_RED : CH.MAT_DIM_RED;
      car.lightBar.blue.material = on ? CH.MAT_DIM_BLUE : CH.MAT_FLASH_BLUE;
    }
  }

  // ---- traffic ----
  function makeTraffic(world, scene) {
    const style = CH.pick(CH.STYLES.slice(0, 6));
    const color = style.id === 'taxi' ? 0xffc94d : CH.pick(CH.CAR_COLORS);
    const car = makeCar(style, color);
    const keys = Array.from(world.nodes.keys());
    const startKey = CH.pick(keys);
    const node = world.nodes.get(startKey);
    car.group.position.set(node.x, 0, node.z);
    car.ai = { at: startKey, to: CH.pick(node.next), prev: null, wait: 0 };
    car.cruise = CH.range(8.5, 13);
    car.heading = 0;
    scene.add(car.group);
    return car;
  }

  function trafficTarget(world, car) {
    const to = world.nodes.get(car.ai.to);
    const from = world.nodes.get(car.ai.at);
    // right-hand lane: facing direction (dx,dz), the right side is (-dz, dx)
    // (facing +Z, right is -X; facing +X, right is +Z — Coral Bay drives on the right)
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const rX = -dz / len, rZ = dx / len;
    return { x: to.x + rX * 3.4, z: to.z + rZ * 3.4, nodeX: to.x, nodeZ: to.z };
  }

  function updateTraffic(car, dt, world, obstacles) {
    if (car.dead) return;
    const t = trafficTarget(world, car);
    const pos = car.group.position;
    const dNode = CH.dist2d(pos.x, pos.z, t.nodeX, t.nodeZ);
    if (dNode < 7) {
      const cur = world.nodes.get(car.ai.to);
      let options = cur.next.filter((k) => k !== car.ai.at);
      if (!options.length) options = cur.next;
      car.ai.prev = car.ai.at;
      car.ai.at = car.ai.to;
      car.ai.to = CH.pick(options);
    }
    const want = Math.atan2(t.x - pos.x, t.z - pos.z);
    const diff = CH.angleDiff(car.heading, want);
    const steer = CH.clamp(diff * 1.6, -1.9 * dt * 3, 1.9 * dt * 3);
    car.heading += CH.clamp(diff, -1.6 * dt, 1.6 * dt);
    // desired speed: slow for sharp turns, stop for obstacles ahead
    let desired = car.cruise * (Math.abs(diff) > 0.5 ? 0.45 : 1);
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o === car) continue;
      const ox = o.group ? o.group.position.x : o.x;
      const oz = o.group ? o.group.position.z : o.z;
      const dx = ox - pos.x, dz = oz - pos.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 10 && side < 2.7) { desired = Math.min(desired, Math.max(0, (ahead - 5.5) * 1.4)); }
    }
    car.speed = CH.lerp(car.speed, desired, dt * (desired < car.speed ? 3.2 : 1.1));
    pos.x += fx * car.speed * dt;
    pos.z += fz * car.speed * dt;
    if (collideWorld(world, pos, car.radius * 0.8)) car.speed *= 0.6;
    syncVisual(car, dt);
  }

  // ---- police ----
  function makePolice(world, scene, nearPos) {
    const style = CH.STYLES[6];
    const car = makeCar(style, 0xf2f2f2);
    // spawn on a road node a good distance from the player
    let best = null, bestD = -1;
    world.nodes.forEach((n) => {
      const d = CH.dist2d(n.x, n.z, nearPos.x, nearPos.z);
      if (d > 45 && d < 95 && d > bestD) { bestD = d; best = n; }
    });
    if (!best) best = world.nodes.get(world.AX[0] + ',' + world.SZ[0]);
    car.group.position.set(best.x, 0, best.z);
    car.heading = CH.range(0, Math.PI * 2);
    scene.add(car.group);
    return car;
  }

  function updatePolice(car, dt, world, target, maxSpeed) {
    if (car.dead) return;
    const pos = car.group.position;
    const tx = target.x + Math.sin(target.heading || 0) * (target.speed || 0) * 0.35;
    const tz = target.z + Math.cos(target.heading || 0) * (target.speed || 0) * 0.35;
    const want = Math.atan2(tx - pos.x, tz - pos.z);
    car.heading += CH.clamp(CH.angleDiff(car.heading, want), -2.1 * dt, 2.1 * dt);
    const d = CH.dist2d(pos.x, pos.z, target.x, target.z);
    let desired = maxSpeed;
    if (d < 7) desired = Math.min(desired, 6 + d);           // sit on the player's bumper
    car.speed = CH.lerp(car.speed, desired, dt * 1.5);
    pos.x += Math.sin(car.heading) * car.speed * dt;
    pos.z += Math.cos(car.heading) * car.speed * dt;
    collideWorld(world, pos, car.radius * 0.8);
    syncVisual(car, dt);
  }

  CH.makeCar = makeCar;
  CH.makeTraffic = makeTraffic;
  CH.updateTraffic = updateTraffic;
  CH.makePolice = makePolice;
  CH.updatePolice = updatePolice;
  CH.collideWorld = collideWorld;
  CH.syncCar = syncVisual;
  CH.MAT_FLASH_RED = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  CH.MAT_DIM_RED = new THREE.MeshBasicMaterial({ color: 0x661111 });
  CH.MAT_FLASH_BLUE = new THREE.MeshBasicMaterial({ color: 0x4488ff });
  CH.MAT_DIM_BLUE = new THREE.MeshBasicMaterial({ color: 0x112266 });
})();
