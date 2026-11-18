// city.js — builds Coral Bay: a pastel beach city on a regular road grid.
// Vertical avenues run north to the coast road, horizontal streets cross
// them, and south of the coast road the city gives up: boardwalk, sand,
// then open sea. Everything procedural, everything from the seeded stream.
(function () {
  'use strict';

  const R = window.CH.rng;

  const AVENUES_X = [-160, -80, 0, 80, 160]; // roads running along z
  const STREETS_Z = [-160, -80, 0, 80]; // roads running along x
  const COAST_Z = 108; // Ocean Drive, the coast road
  const ROAD_HALF = 8; // half the road width
  const CITY_MIN = -196;
  const CITY_MAX = 196;
  const SAND_START = 122;
  const SEA_START = 178;

  const PASTELS = [0xf6c6a5, 0xf2a7bb, 0x9fd8c9, 0xa5c8f0, 0xf7e3a1, 0xd9b8f0, 0xffb59e, 0xb5e3f2];

  // One shared window-facade texture, drawn once on a canvas. Lit windows
  // are baked in warm yellow for the golden-hour look.
  function makeFacadeTexture(rng) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 256);
    const cols = 5;
    const rows = 10;
    const cw = 128 / cols;
    const ch = 256 / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = rng() < 0.35;
        g.fillStyle = lit ? '#ffd97a' : '#33506b';
        g.fillRect(x * cw + 4, y * ch + 5, cw - 8, ch - 10);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  function buildCity(scene) {
    const rng = R.makeRng(4242);
    const colliders = [];
    const animated = [];

    // --- light: late golden hour --------------------------------------
    scene.background = new THREE.Color(0x2e4a6b);
    scene.fog = new THREE.Fog(0xe8906a, 180, 620);
    const hemi = new THREE.HemisphereLight(0xffd9a8, 0x35506e, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
    sun.position.set(-140, 90, 260);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.25);
    fill.position.set(120, 80, -140);
    scene.add(fill);

    // Sky dome: a big inverted sphere with a vertical gradient baked into
    // a canvas texture — orange at the horizon, deep blue up top.
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4;
    skyCanvas.height = 256;
    const sg = skyCanvas.getContext('2d');
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#1d3a5f');
    grad.addColorStop(0.45, '#7a6a9e');
    grad.addColorStop(0.72, '#e8906a');
    grad.addColorStop(1, '#ffc98a');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 4, 256);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 16, 12),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(skyCanvas), side: THREE.BackSide, fog: false })
    );
    scene.add(sky);

    // Sun disc low over the sea.
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(38, 24),
      new THREE.MeshBasicMaterial({ color: 0xffdf9e, fog: false })
    );
    sunDisc.position.set(-260, 70, 840);
    sunDisc.lookAt(0, 40, 0);
    scene.add(sunDisc);

    // --- ground planes ---------------------------------------------------
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(440, 340),
      new THREE.MeshLambertMaterial({ color: 0x8f8574 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, -38);
    scene.add(ground);

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(440, SEA_START - SAND_START + 30),
      new THREE.MeshLambertMaterial({ color: 0xeed9a4 })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.0, (SAND_START + SEA_START) / 2 + 8);
    scene.add(sand);

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 500),
      new THREE.MeshLambertMaterial({ color: 0x2e7ea6, transparent: true, opacity: 0.92 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.4, SEA_START + 240);
    scene.add(sea);
    animated.push(function (t) {
      sea.position.y = -0.4 + Math.sin(t * 0.7) * 0.12;
    });

    // --- roads -----------------------------------------------------------
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x35313c });
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf7d774 });
    const dashGeoLong = new THREE.BoxGeometry(0.5, 0.06, 6);
    const dashGeoWide = new THREE.BoxGeometry(6, 0.06, 0.5);

    function roadPlane(w, d, x, z) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, z);
      scene.add(m);
    }

    AVENUES_X.forEach(function (x) {
      roadPlane(ROAD_HALF * 2, COAST_Z - CITY_MIN + 16, x, (CITY_MIN + COAST_Z) / 2);
      for (let z = CITY_MIN + 10; z < COAST_Z - 6; z += 14) {
        const dash = new THREE.Mesh(dashGeoLong, dashMat);
        dash.position.set(x, 0.05, z);
        scene.add(dash);
      }
    });
    STREETS_Z.concat([COAST_Z]).forEach(function (z) {
      roadPlane(CITY_MAX - CITY_MIN + 16, ROAD_HALF * 2, 0, z);
      for (let x = CITY_MIN + 10; x < CITY_MAX - 6; x += 14) {
        const dash = new THREE.Mesh(dashGeoWide, dashMat);
        dash.position.set(x, 0.05, z);
        scene.add(dash);
      }
    });

    // Boardwalk between coast road and sand.
    const boardwalk = new THREE.Mesh(
      new THREE.BoxGeometry(420, 0.3, 6),
      new THREE.MeshLambertMaterial({ color: 0xb08954 })
    );
    boardwalk.position.set(0, 0.15, 118);
    scene.add(boardwalk);

    // --- blocks: sidewalks + buildings -----------------------------------
    const facadeTex = makeFacadeTexture(rng);
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xbdb09a });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b5a4e });

    const blockEdgesX = [-196].concat(AVENUES_X.map(function (x) { return x + ROAD_HALF + 3; }));
    // Block spans sit between consecutive roads, inset by sidewalk margin.
    function blockSpans(lines, min, max) {
      const spans = [];
      const sorted = lines.slice().sort(function (a, b) { return a - b; });
      let prev = min;
      sorted.forEach(function (line) {
        spans.push([prev, line - ROAD_HALF - 3]);
        prev = line + ROAD_HALF + 3;
      });
      spans.push([prev, max]);
      return spans.filter(function (s) { return s[1] - s[0] > 18; });
    }

    const xSpans = blockSpans(AVENUES_X, CITY_MIN, CITY_MAX);
    const zSpans = blockSpans(STREETS_Z, CITY_MIN, COAST_Z - 4);

    xSpans.forEach(function (xs) {
      zSpans.forEach(function (zs) {
        const cx = (xs[0] + xs[1]) / 2;
        const cz = (zs[0] + zs[1]) / 2;
        const w = xs[1] - xs[0];
        const d = zs[1] - zs[0];
        const walk = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 0.24, d + 2), sidewalkMat);
        walk.position.set(cx, 0.12, cz);
        scene.add(walk);

        // One or two buildings per block.
        const lots = rng() < 0.4 ? 2 : 1;
        for (let i = 0; i < lots; i++) {
          const bw = lots === 1 ? w * R.randRange(0.55, 0.8) : w * 0.38;
          const bd = d * R.randRange(0.5, 0.78);
          const bx = lots === 1 ? cx + R.randRange(-3, 3) : xs[0] + (i + 0.5) * (w / 2) + R.randRange(-1.5, 1.5);
          const bz = cz + R.randRange(-3, 3);
          const height = R.randRange(10, 42);
          const color = R.pick(PASTELS);
          const mat = new THREE.MeshLambertMaterial({ color: color, map: facadeTex });
          const b = new THREE.Mesh(new THREE.BoxGeometry(bw, height, bd), mat);
          b.position.set(bx, height / 2 + 0.2, bz);
          scene.add(b);
          const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.8, 0.7, bd + 0.8), roofMat);
          roof.position.set(bx, height + 0.5, bz);
          scene.add(roof);
          colliders.push({ minX: bx - bw / 2, maxX: bx + bw / 2, minZ: bz - bd / 2, maxZ: bz + bd / 2 });
        }
      });
    });

    // --- palms -------------------------------------------------------------
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7, 6);
    const frondGeo = new THREE.BoxGeometry(0.5, 0.08, 3.6);

    function palm(x, z) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3.5;
      trunk.rotation.z = R.randRange(-0.08, 0.08);
      g.add(trunk);
      for (let i = 0; i < 6; i++) {
        const f = new THREE.Mesh(frondGeo, frondMat);
        const a = (i / 6) * Math.PI * 2;
        f.position.set(Math.sin(a) * 1.4, 7.1, Math.cos(a) * 1.4);
        f.rotation.y = a;
        f.rotation.z = 0.5;
        g.add(f);
      }
      g.position.set(x, 0, z);
      scene.add(g);
    }

    // Palms line Ocean Drive and dot the beach.
    for (let x = -190; x <= 190; x += 19) {
      palm(x + R.randRange(-2, 2), 113.5);
      if (rng() < 0.7) palm(x + 9, 128 + rng() * 30);
    }
    AVENUES_X.forEach(function (x) {
      for (let z = -180; z < 100; z += 38) {
        if (rng() < 0.6) palm(x + ROAD_HALF + 2.5, z + R.randRange(-3, 3));
      }
    });

    // --- streetlights ------------------------------------------------------
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4148 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 6.4, 5);
    const bulbGeo = new THREE.SphereGeometry(0.42, 8, 6);
    function streetlight(x, z) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 3.2, z);
      scene.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(x, 6.5, z);
      scene.add(bulb);
    }
    AVENUES_X.forEach(function (x) {
      STREETS_Z.forEach(function (z) {
        streetlight(x - ROAD_HALF - 1, z - ROAD_HALF - 1);
        streetlight(x + ROAD_HALF + 1, z + ROAD_HALF + 1);
      });
    });
    for (let x = -180; x <= 180; x += 45) streetlight(x, COAST_Z - ROAD_HALF - 1);

    // --- beach props: umbrellas -------------------------------------------
    const umbrellaCols = [0xe74c3c, 0xf39c12, 0x2ecc71, 0x9b59b6, 0xfd79a8];
    for (let i = 0; i < 16; i++) {
      const ux = R.randRange(-190, 190);
      const uz = R.randRange(132, 168);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), poleMat);
      pole.position.set(ux, 1.3, uz);
      scene.add(pole);
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(2.2, 0.9, 8),
        new THREE.MeshLambertMaterial({ color: R.pick(umbrellaCols) })
      );
      top.position.set(ux, 2.8, uz);
      scene.add(top);
    }

    function isRoad(x, z) {
      if (z > COAST_Z + ROAD_HALF) return false;
      for (let i = 0; i < AVENUES_X.length; i++) if (Math.abs(x - AVENUES_X[i]) <= ROAD_HALF) return true;
      const all = STREETS_Z.concat([COAST_Z]);
      for (let i = 0; i < all.length; i++) if (Math.abs(z - all[i]) <= ROAD_HALF) return true;
      return false;
    }

    // Push a circle (x/z + radius) out of every building collider and keep
    // it inside the playable bounds. Mutates and returns the position.
    function collide(pos, radius) {
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        const nx = R.clamp(pos.x, c.minX, c.maxX);
        const nz = R.clamp(pos.z, c.minZ, c.maxZ);
        const dx = pos.x - nx;
        const dz = pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            pos.x = nx + (dx / d) * radius;
            pos.z = nz + (dz / d) * radius;
          } else {
            // Centre inside the box: push out along the smallest exit.
            const left = pos.x - c.minX;
            const right = c.maxX - pos.x;
            const top = pos.z - c.minZ;
            const bottom = c.maxZ - pos.z;
            const m = Math.min(left, right, top, bottom);
            if (m === left) pos.x = c.minX - radius;
            else if (m === right) pos.x = c.maxX + radius;
            else if (m === top) pos.z = c.minZ - radius;
            else pos.z = c.maxZ + radius;
          }
        }
      }
      pos.x = R.clamp(pos.x, CITY_MIN - 4, CITY_MAX + 4);
      pos.z = R.clamp(pos.z, CITY_MIN - 4, SEA_START + 26);
      return pos;
    }

    return {
      colliders,
      avenuesX: AVENUES_X,
      streetsZ: STREETS_Z,
      coastZ: COAST_Z,
      roadHalf: ROAD_HALF,
      sandStart: SAND_START,
      seaStart: SEA_START,
      isRoad,
      collide,
      update: function (t) {
        for (let i = 0; i < animated.length; i++) animated[i](t);
      },
    };
  }

  window.CH = window.CH || {};
  window.CH.city = { build: buildCity };
})();
