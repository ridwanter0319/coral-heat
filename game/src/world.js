// Coral Heat — Coral Bay: a sun-soaked coastal grid built procedurally with three.js.
// Avenues run north–south, streets east–west, and the Bay Boulevard fronts a sandy beach and
// the water. Buildings get canvas-painted window facades; palms, streetlights, parking lots
// and plazas fill the blocks. The module also hands back the data the rest of the game needs:
// building colliders, the traffic road-graph, sidewalk segments and parked-car spots.
window.CH = window.CH || {};

CH.WORLD = (function () {
  const ROAD_HALF = 7;                 // half the width of a road
  const AX = [-120, -72, -24, 24, 72, 120];   // avenue centre-lines (x)
  const SZ = [-120, -72, -24, 24, 72];        // street centre-lines (z)
  const BOULEVARD = 120;                      // coastal road centre-line (z)
  const ALL_Z = SZ.concat([BOULEVARD]);       // every east-west line avenues meet
  const CITY = { minX: -150, maxX: 150, minZ: -150, maxZ: 132 };
  const BEACH_Z = 150;                        // sand meets water

  // ---------- canvas textures ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function asphaltTex() {
    return canvasTex(128, 128, (g) => {
      g.fillStyle = '#3c4147'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 500; i++) {
        g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')';
        g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
      }
      g.fillStyle = '#e8c85a';
      g.fillRect(60, 6, 8, 44); g.fillRect(60, 78, 8, 44);   // centre dashes (along V)
    }, true);
  }
  function facadeTex(base, trim) {
    return canvasTex(128, 256, (g) => {
      g.fillStyle = base; g.fillRect(0, 0, 128, 256);
      g.fillStyle = trim; g.fillRect(0, 0, 128, 10); g.fillRect(0, 246, 128, 10);
      const lit = ['#ffe9a8', '#ffd27a', '#cfe8ff', '#2b3a44'];
      for (let y = 22; y < 240; y += 26) {
        for (let x = 12; x < 116; x += 26) {
          g.fillStyle = lit[Math.floor(Math.random() * lit.length)];
          g.fillRect(x, y, 15, 16);
          g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y + 13, 15, 3);
        }
      }
    });
  }
  function frondTex() {
    const t = canvasTex(128, 128, (g) => {
      g.clearRect(0, 0, 128, 128);
      g.strokeStyle = '#2e7d3a'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(64, 128); g.quadraticCurveTo(60, 60, 64, 6); g.stroke();
      g.lineWidth = 3; g.strokeStyle = '#3f9e4d';
      for (let i = 0; i < 12; i++) {
        const y = 116 - i * 9, s = 10 + i * 4.4;
        g.beginPath(); g.moveTo(63, y); g.lineTo(63 - s, y - 12); g.stroke();
        g.beginPath(); g.moveTo(65, y); g.lineTo(65 + s, y - 12); g.stroke();
      }
    });
    return t;
  }
  function sandTex() {
    return canvasTex(128, 128, (g) => {
      g.fillStyle = '#ecd29a'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 700; i++) {
        g.fillStyle = 'rgba(160,120,60,' + (Math.random() * 0.16) + ')';
        g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
      }
    }, true);
  }

  // ---------- build ----------
  function build(scene) {
    const colliders = [];       // {minX,maxX,minZ,maxZ}
    const parkedSpots = [];     // {x,z,heading}
    const sidewalkSegs = [];    // {ax,az,bx,bz}
    const nodes = new Map();    // "x,z" -> {x,z,next:[keys]}

    scene.fog = new THREE.Fog(0xf2b27a, 240, 980);
    scene.background = canvasTex(16, 256, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#3f7fbf'); gr.addColorStop(0.45, '#7fb2dd');
      gr.addColorStop(0.72, '#f7c873'); gr.addColorStop(1, '#ff9e57');
      g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
    });

    const hemi = new THREE.HemisphereLight(0xffd9a8, 0x74604a, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb36b, 1.9);
    sun.position.set(-140, 95, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
    sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110;
    sun.shadow.camera.far = 520;
    sun.shadow.bias = -0.0006;
    scene.add(sun); scene.add(sun.target);
    scene.add(new THREE.AmbientLight(0xffe0b8, 0.25));

    const asphalt = asphaltTex();
    const sand = sandTex(); sand.repeat.set(24, 4);

    // base ground (under everything: dusty verge colour, wide enough that its
    // edge sits beyond the fog — and it stops at the shoreline so the sea shows)
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 1400),
      new THREE.MeshLambertMaterial({ color: 0x8b8f7a })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(0, -0.08, -550); // spans z from -1250 to 150 (the waterline)
    base.receiveShadow = true;
    scene.add(base);

    // roads: avenues (along Z) and streets + boulevard (along X)
    const roadMat = new THREE.MeshLambertMaterial({ map: asphalt });
    function road(cx, cz, w, l, alongZ) {
      const tex = asphalt.clone(); tex.needsUpdate = true;
      tex.repeat.set(1, Math.max(2, Math.round(l / 14)));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l),
        new THREE.MeshLambertMaterial({ map: tex }));
      m.rotation.x = -Math.PI / 2;
      if (!alongZ) m.rotation.z = Math.PI / 2;
      m.position.set(cx, 0, cz);
      m.receiveShadow = true;
      scene.add(m);
    }
    AX.forEach((x) => road(x, -12, ROAD_HALF * 2, 288, true));
    SZ.concat([BOULEVARD]).forEach((z) => road(0, z, ROAD_HALF * 2, 308, false));

    // sidewalks: pale slabs hugging every road
    const walkMat = new THREE.MeshLambertMaterial({ color: 0xcfc8b8 });
    function slab(x, z, w, d) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), walkMat);
      m.position.set(x, 0.11, z); m.receiveShadow = true; scene.add(m);
    }
    AX.forEach((x) => { slab(x - ROAD_HALF - 1.6, -12, 3.2, 288); slab(x + ROAD_HALF + 1.6, -12, 3.2, 288); });
    SZ.concat([BOULEVARD]).forEach((z) => { slab(0, z - ROAD_HALF - 1.6, 308, 3.2); slab(0, z + ROAD_HALF + 1.6, 308, 3.2); });

    // sidewalk walking segments for pedestrians (both sides of every road)
    const OFF = ROAD_HALF + 1.6;
    AX.forEach((x) => {
      [-OFF, OFF].forEach((o) => sidewalkSegs.push({ ax: x + o, az: -140, bx: x + o, bz: 116 }));
    });
    SZ.concat([BOULEVARD]).forEach((z) => {
      [-OFF, OFF].forEach((o) => sidewalkSegs.push({ ax: -146, az: z + o, bx: 146, bz: z + o }));
    });

    // traffic graph: intersections + links along each road
    function nodeKey(x, z) { return x + ',' + z; }
    AX.forEach((x) => ALL_Z.forEach((z) => nodes.set(nodeKey(x, z), { x, z, next: [] })));
    function link(x1, z1, x2, z2) {
      nodes.get(nodeKey(x1, z1)).next.push(nodeKey(x2, z2));
      nodes.get(nodeKey(x2, z2)).next.push(nodeKey(x1, z1));
    }
    AX.forEach((x) => { for (let i = 0; i < ALL_Z.length - 1; i++) link(x, ALL_Z[i], x, ALL_Z[i + 1]); });
    ALL_Z.forEach((z) => { for (let i = 0; i < AX.length - 1; i++) link(AX[i], z, AX[i + 1], z); });

    // ---------- blocks: buildings, lots, plazas ----------
    const palettes = [
      ['#f6ead8', '#e2725b'], ['#f9d976', '#d1603d'], ['#bfe3dd', '#3d8b84'],
      ['#f6c6b8', '#c25e4e'], ['#eef2f5', '#5b84ae'], ['#f3e2c7', '#a9713d'],
      ['#d9ead3', '#5f8f52'], ['#f9e2e4', '#b04a5e'],
    ];
    const facades = palettes.map((p) => facadeTex(p[0], p[1]));
    const topMat = new THREE.MeshLambertMaterial({ color: 0x9b8f7d });
    const frond = frondTex();

    function palm(x, z, s) {
      const g = new THREE.Group();
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
      const lean = CH.range(-0.14, 0.14);
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.02, 0.2 - i * 0.02, 1.6, 6), trunkMat);
        seg.position.set(lean * i * i * 0.4, 0.8 + i * 1.5, 0);
        seg.rotation.z = lean;
        seg.castShadow = true;
        g.add(seg);
      }
      const topX = lean * 9 * 0.4;
      for (let i = 0; i < 7; i++) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4),
          new THREE.MeshLambertMaterial({ map: frond, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }));
        f.position.set(topX, 6.6, 0);
        f.rotation.set(-0.5 - CH.random() * 0.5, (i / 7) * Math.PI * 2, 0, 'YXZ');
        f.castShadow = true;
        g.add(f);
      }
      g.position.set(x, 0, z);
      g.scale.setScalar(s || 1);
      scene.add(g);
    }

    function building(x, z, w, d, h) {
      const tex = CH.pick(facades);
      const side = new THREE.MeshLambertMaterial({ map: tex });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        [side, side, topMat, topMat, side, side]);
      m.position.set(x, h / 2 + 0.2, z);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 1.6, d * 0.4), topMat);
      cap.position.set(x, h + 1, z); cap.castShadow = true;
      scene.add(cap);
      colliders.push({ minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4, minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4 });
    }

    const lotMat = new THREE.MeshLambertMaterial({ color: 0x555b61 });
    for (let bi = 0; bi < AX.length - 1; bi++) {
      for (let bj = 0; bj < ALL_Z.length - 1; bj++) {
        const cx = (AX[bi] + AX[bi + 1]) / 2, cz = (ALL_Z[bj] + ALL_Z[bj + 1]) / 2;
        const kind = CH.random();
        if (kind < 0.58) {
          // buildings: 2–4 per block on a shared slab
          slab(cx, cz, 33, 33);
          const n = CH.randi(2, 4);
          const spots = [[-7.8, -7.8], [7.8, -7.8], [-7.8, 7.8], [7.8, 7.8]];
          for (let i = 0; i < n; i++) {
            building(cx + spots[i][0], cz + spots[i][1],
              CH.range(9.5, 12.5), CH.range(9.5, 12.5), CH.range(9, 40));
          }
          if (CH.chance(0.7)) palm(cx + CH.range(-13, 13), cz + CH.range(-13, 13), CH.range(0.85, 1.15));
        } else if (kind < 0.8) {
          // parking lot with stealable cars
          const lot = new THREE.Mesh(new THREE.BoxGeometry(33, 0.18, 33), lotMat);
          lot.position.set(cx, 0.09, cz); lot.receiveShadow = true; scene.add(lot);
          const n = CH.randi(2, 5);
          for (let i = 0; i < n; i++) {
            parkedSpots.push({
              x: cx - 12 + i * 6.2, z: cz - 10,
              heading: Math.PI / 2 + CH.range(-0.05, 0.05),
            });
            if (CH.chance(0.6)) parkedSpots.push({
              x: cx - 12 + i * 6.2, z: cz + 10,
              heading: -Math.PI / 2 + CH.range(-0.05, 0.05),
            });
          }
        } else {
          // plaza: palms, benches, a kiosk
          slab(cx, cz, 33, 33);
          for (let i = 0; i < 5; i++) palm(cx + CH.range(-13, 13), cz + CH.range(-13, 13), CH.range(0.9, 1.25));
          const kiosk = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 5),
            new THREE.MeshLambertMaterial({ color: 0xe2725b }));
          kiosk.position.set(cx, 1.9, cz); kiosk.castShadow = true; scene.add(kiosk);
          colliders.push({ minX: cx - 2.9, maxX: cx + 2.9, minZ: cz - 2.9, maxZ: cz + 2.9 });
        }
      }
    }

    // streetlights at intersections
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a4148 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8 });
    AX.forEach((x) => ALL_Z.forEach((z) => {
      [[9.4, 9.4], [-9.4, -9.4]].forEach((o) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5), poleMat);
        p.position.set(x + o[0], 2.8, z + o[1]); scene.add(p);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 5), lampMat);
        lamp.position.set(x + o[0], 5.7, z + o[1]); scene.add(lamp);
      });
    }));

    // ---------- beach & water ----------
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(360, 52),
      new THREE.MeshLambertMaterial({ map: sand }));
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(0, 0.02, 156);
    beach.receiveShadow = true;
    scene.add(beach);
    // boardwalk strip
    const walk = new THREE.Mesh(new THREE.BoxGeometry(340, 0.24, 7),
      new THREE.MeshLambertMaterial({ color: 0xa9805a }));
    walk.position.set(0, 0.12, 133); walk.receiveShadow = true; scene.add(walk);
    for (let x = -150; x <= 150; x += 25) palm(x + CH.range(-3, 3), 137 + CH.range(-1.5, 1.5), CH.range(0.95, 1.3));
    // beach umbrellas
    const umbCols = [0xff6b4a, 0xffc94d, 0x3d8b84, 0xf9e2e4];
    for (let i = 0; i < 14; i++) {
      const ux = CH.range(-155, 155), uz = CH.range(146, 168);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), poleMat);
      pole.position.set(ux, 1.2, uz); scene.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.8, 8),
        new THREE.MeshLambertMaterial({ color: CH.pick(umbCols) }));
      top.position.set(ux, 2.5, uz); top.castShadow = true; scene.add(top);
    }
    const waterMat = new THREE.MeshPhongMaterial({
      color: 0x2b97b5, emissive: 0x0a2e3d, shininess: 140, specular: 0xffd9a0, transparent: true, opacity: 0.94,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 900), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.35, BEACH_Z + 445);
    scene.add(water);
    // a low sun disc sprite over the water
    const sunSprite = new THREE.Mesh(new THREE.CircleGeometry(16, 24),
      new THREE.MeshBasicMaterial({ color: 0xffdf9e, fog: false }));
    sunSprite.position.set(-260, 52, 330);
    sunSprite.lookAt(0, 30, 0);
    scene.add(sunSprite);

    let t = 0;
    function update(dt) {
      t += dt;
      water.position.y = -0.35 + Math.sin(t * 0.7) * 0.05;
    }

    return {
      colliders, parkedSpots, sidewalkSegs, nodes, sun, update,
      AX, SZ, ALL_Z, ROAD_HALF, CITY, BEACH_Z,
      playerStart: { x: 20, z: 133 }, // on the pier boardwalk — Dario washes up facing the city
      hideout: { x: 96, z: -96 },
    };
  }

  return { build, ROAD_HALF, AX, SZ, BOULEVARD };
})();
