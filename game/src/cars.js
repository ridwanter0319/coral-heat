// cars.js — Coral Bay vehicles: five invented body styles built from boxes,
// the parked cars the player can steal, traffic AI that cruises the grid
// and brakes for trouble, and the coral-and-white police interceptors that
// give chase once the wanted level climbs.
(function () {
  'use strict';

  const R = window.CH.rng;

  const PAINT = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xfd79a8, 0xecf0f1, 0x9b59b6, 0xe67e22, 0x1abc9c, 0x95a5a6];

  const STYLES = {
    compact: { len: 3.4, wid: 1.7, bodyH: 0.55, cabinLen: 1.7, cabinH: 0.5 },
    sedan: { len: 4.3, wid: 1.85, bodyH: 0.6, cabinLen: 2.1, cabinH: 0.52 },
    pickup: { len: 4.6, wid: 1.95, bodyH: 0.72, cabinLen: 1.5, cabinH: 0.6 },
    cruiser: { len: 4.4, wid: 1.9, bodyH: 0.62, cabinLen: 2.2, cabinH: 0.55 },
    van: { len: 4.5, wid: 1.95, bodyH: 1.05, cabinLen: 3.2, cabinH: 0.75 },
  };

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x22384d });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });

  function buildCarMesh(styleName, color) {
    const s = STYLES[styleName] || STYLES.sedan;
    const group = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color });

    const body = new THREE.Mesh(new THREE.BoxGeometry(s.wid, s.bodyH, s.len), paint);
    body.position.y = 0.55;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(s.wid * 0.86, s.cabinH, s.cabinLen), glassMat);
    cabin.position.set(0, 0.55 + s.bodyH / 2 + s.cabinH / 2 - 0.05, styleName === 'pickup' ? s.len * 0.18 : -0.1);
    group.add(cabin);

    const wheels = [];
    const wx = s.wid / 2 - 0.05;
    const wz = s.len / 2 - 0.75;
    [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]].forEach(function (p) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.36, p[1]);
      group.add(w);
      wheels.push(w);
    });

    const hl = new THREE.Mesh(new THREE.BoxGeometry(s.wid * 0.7, 0.16, 0.06), lightMat);
    hl.position.set(0, 0.62, s.len / 2 + 0.02);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(s.wid * 0.7, 0.14, 0.06), tailMat);
    tl.position.set(0, 0.66, -s.len / 2 - 0.02);
    group.add(tl);

    group.userData.wheels = wheels;
    group.userData.len = s.len;
    return group;
  }

  function buildPoliceMesh() {
    const group = buildCarMesh('cruiser', 0xf4f6f8);
    // Coral door band + light bar with separately coloured lamps so the
    // main loop can strobe them.
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(1.94, 0.3, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xff7847 })
    );
    band.position.y = 0.52;
    group.add(band);
    const barMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4), barMat);
    bar.position.set(0, 1.62, -0.1);
    group.add(bar);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2266ff });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.42), redMat);
    red.position.set(-0.3, 1.64, -0.1);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.42), blueMat);
    blue.position.set(0.3, 1.64, -0.1);
    group.add(blue);
    group.userData.redMat = redMat;
    group.userData.blueMat = blueMat;
    return group;
  }

  function makeCarObject(mesh, scene, x, z, heading) {
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    return {
      mesh,
      pos: mesh.position,
      heading,
      speed: 0,
      style: null,
      isPolice: false,
      driver: null, // 'player' | 'traffic' | 'police' | null (parked)
      health: 100,
    };
  }

  // --- parked cars the player can steal -----------------------------------
  function spawnParkedCars(scene, city, count) {
    const cars = [];
    const styleNames = Object.keys(STYLES).filter(function (s) { return s !== 'cruiser'; });
    for (let i = 0; i < count; i++) {
      const avenue = R.pick(city.avenuesX);
      const side = R.rand() < 0.5 ? -1 : 1;
      const x = avenue + side * (city.roadHalf - 1.9);
      const z = R.randRange(-185, 95);
      const style = R.pick(styleNames);
      const mesh = buildCarMesh(style, R.pick(PAINT));
      const car = makeCarObject(mesh, scene, x, z, side > 0 ? 0 : Math.PI);
      car.style = style;
      cars.push(car);
    }
    return cars;
  }

  // --- traffic --------------------------------------------------------------
  function spawnTrafficCars(scene, city, count) {
    const cars = [];
    const styleNames = Object.keys(STYLES).filter(function (s) { return s !== 'cruiser'; });
    for (let i = 0; i < count; i++) {
      const alongAvenue = R.rand() < 0.5;
      const dir = R.rand() < 0.5 ? 1 : -1;
      const style = R.pick(styleNames);
      const mesh = buildCarMesh(style, R.pick(PAINT));
      let x;
      let z;
      let heading;
      if (alongAvenue) {
        const a = R.pick(city.avenuesX);
        x = a + (dir > 0 ? -2.8 : 2.8);
        z = R.randRange(-180, 90);
        heading = dir > 0 ? 0 : Math.PI;
      } else {
        const s = R.pick(city.streetsZ.concat([city.coastZ]));
        z = s + (dir > 0 ? 2.8 : -2.8);
        x = R.randRange(-180, 180);
        heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      const car = makeCarObject(mesh, scene, x, z, heading);
      car.style = style;
      car.driver = 'traffic';
      car.axis = alongAvenue ? 'z' : 'x';
      car.dir = dir;
      car.cruise = R.randRange(8, 13);
      car.speed = car.cruise;
      car.turnCooldown = 0;
      cars.push(car);
    }
    return cars;
  }

  function laneOffsetFor(car) {
    return car.dir > 0 ? -2.8 : 2.8;
  }

  function updateTrafficCar(car, dt, city, obstacles) {
    car.turnCooldown -= dt;
    // Look ahead: brake for anything close in front.
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let blocked = false;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o === car) continue;
      const dx = o.pos.x - car.pos.x;
      const dz = o.pos.z - car.pos.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 8 && side < 1.8) { blocked = true; break; }
    }
    const target = blocked ? 0 : car.cruise;
    car.speed += R.clamp(target - car.speed, -22 * dt, 6 * dt);

    car.pos.x += fx * car.speed * dt;
    car.pos.z += fz * car.speed * dt;

    // At an intersection, sometimes turn onto the crossing road.
    const crossLines = car.axis === 'z' ? city.streetsZ.concat([city.coastZ]) : city.avenuesX;
    const along = car.axis === 'z' ? car.pos.z : car.pos.x;
    for (let i = 0; i < crossLines.length; i++) {
      if (Math.abs(along - crossLines[i]) < 1.2 && car.turnCooldown <= 0 && R.rand() < 0.35) {
        const line = crossLines[i];
        car.turnCooldown = 4;
        car.dir = R.rand() < 0.5 ? 1 : -1;
        if (car.axis === 'z') {
          car.axis = 'x';
          car.pos.z = line + (car.dir > 0 ? 2.8 : -2.8);
          car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          car.axis = 'z';
          car.pos.x = line + (car.dir > 0 ? -2.8 : 2.8);
          car.heading = car.dir > 0 ? 0 : Math.PI;
        }
        break;
      }
    }
    // Keep the car glued to its lane centre on the current axis.
    if (car.axis === 'z') {
      let best = null;
      let bestD = 1e9;
      city.avenuesX.forEach(function (a) {
        const d = Math.abs(car.pos.x - a);
        if (d < bestD) { bestD = d; best = a; }
      });
      car.pos.x = R.lerp(car.pos.x, best + laneOffsetFor(car), Math.min(1, dt * 3));
      if (car.pos.z > 102) { car.dir = -1; car.heading = Math.PI; }
      if (car.pos.z < -190) { car.dir = 1; car.heading = 0; }
    } else {
      let best = null;
      let bestD = 1e9;
      city.streetsZ.concat([city.coastZ]).forEach(function (s) {
        const d = Math.abs(car.pos.z - s);
        if (d < bestD) { bestD = d; best = s; }
      });
      car.pos.z = R.lerp(car.pos.z, best - laneOffsetFor(car), Math.min(1, dt * 3));
      if (car.pos.x > 190) { car.dir = -1; car.heading = -Math.PI / 2; }
      if (car.pos.x < -190) { car.dir = 1; car.heading = Math.PI / 2; }
    }

    car.mesh.rotation.y = car.heading;
    spinWheels(car, dt);
  }

  function spinWheels(car, dt) {
    const wheels = car.mesh.userData.wheels || [];
    const rot = (car.speed * dt) / 0.36;
    for (let i = 0; i < wheels.length; i++) wheels[i].rotation.x += rot;
  }

  // --- police -----------------------------------------------------------------
  function spawnPoliceCar(scene, x, z) {
    const mesh = buildPoliceMesh();
    const car = makeCarObject(mesh, scene, x, 0, 0);
    car.pos.z = z;
    car.isPolice = true;
    car.driver = 'police';
    car.style = 'cruiser';
    return car;
  }

  // Steering pursuit: turn toward the target at a capped rate, accelerate
  // hard, and keep coming even off-road. Returns distance to the target.
  function updatePoliceCar(car, dt, targetPos, city, aggression) {
    const dx = targetPos.x - car.pos.x;
    const dz = targetPos.z - car.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const desired = Math.atan2(dx, dz);
    const delta = R.angleDelta(car.heading, desired);
    const turnRate = 1.9;
    car.heading += R.clamp(delta, -turnRate * dt, turnRate * dt);
    const maxSpeed = 17 + aggression * 2.2;
    const accel = Math.abs(delta) > 1.2 ? 4 : 13;
    car.speed = Math.min(maxSpeed, car.speed + accel * dt);
    // If the target is right behind, reverse briefly instead of orbiting.
    if (dist < 6 && Math.abs(delta) > 2.2) car.speed = -6;
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    city.collide(car.pos, 1.25);
    car.mesh.rotation.y = car.heading;
    spinWheels(car, dt);
    return dist;
  }

  // --- player driving -----------------------------------------------------------
  // Arcade model: throttle/brake/reverse on one axis, speed-sensitive
  // steering, gentle lateral grip. Returns speed in km/h for the HUD.
  function drivePlayerCar(car, input, dt, city) {
    const MAX_FWD = 30;
    const MAX_REV = 9;
    if (input.throttle) car.speed += 14 * dt;
    else if (input.brake) car.speed -= (car.speed > 0.5 ? 24 : 7) * dt;
    else car.speed -= car.speed * 0.55 * dt; // engine drag
    if (input.handbrake) car.speed -= car.speed * 2.4 * dt;
    car.speed = R.clamp(car.speed, -MAX_REV, MAX_FWD);
    if (!input.throttle && !input.brake && Math.abs(car.speed) < 0.12) car.speed = 0;

    const steerAmount = 0.62 / (1 + Math.abs(car.speed) * 0.055);
    if (input.steer !== 0 && car.speed !== 0) {
      const dirSign = car.speed >= 0 ? 1 : -1;
      car.heading += input.steer * steerAmount * dirSign * dt * Math.min(3.2, Math.abs(car.speed) * 0.55 + 0.6);
    }
    const beforeX = car.pos.x;
    const beforeZ = car.pos.z;
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    city.collide(car.pos, 1.3);
    // If a building stopped us dead, bleed the speed off (a soft crunch).
    const moved = R.distance2D(beforeX, beforeZ, car.pos.x, car.pos.z);
    if (moved < Math.abs(car.speed) * dt * 0.25 && Math.abs(car.speed) > 6) {
      car.crunched = true;
      car.speed *= 0.25;
    }
    car.mesh.rotation.y = car.heading;
    spinWheels(car, dt);
    return Math.abs(car.speed) * 3.6;
  }

  window.CH = window.CH || {};
  window.CH.cars = {
    STYLES,
    PAINT,
    buildCarMesh,
    buildPoliceMesh,
    spawnParkedCars,
    spawnTrafficCars,
    updateTrafficCar,
    spawnPoliceCar,
    updatePoliceCar,
    drivePlayerCar,
  };
})();
