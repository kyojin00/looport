// viewer-three.js — Three.js 초기화, 카메라, 컨테이너 빌드, 메시

// ─── THREE.JS ─────────────────────────────────────────────────
let scene, camera, renderer, raycaster, mouse;
let camTheta = Math.PI / 4, camPhi = Math.PI / 3.5, camRadius = 40000;
let camTarget = { x: 0, y: 1140, z: 0 };
let orbit = { active: false, right: false, lx: 0, ly: 0 };
let meshMap = {}; // id → Mesh
let containerObjects = []; // [{ mesh, wire, floor }]

let CONT_SPACING = 500; // 컨테이너 간 간격 mm (setContSpacing으로 변경 가능)
const WALL_T = 80;         // 컨테이너 벽 두께 mm (내부 오프셋용)

function initThree() {
  const canvas = document.getElementById('canvas3d');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x1a1e26);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1e26);

  const vp = canvas.parentElement;
  camera = new THREE.PerspectiveCamera(45, vp.clientWidth / vp.clientHeight, 10, 500000);

  // 조명 (원본)
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const dir = new THREE.DirectionalLight(0xfff5e0, 1.2);
  dir.position.set(10000, 18000, 10000);
  dir.castShadow = true;
  dir.shadow.mapSize.set(4096, 4096);
  dir.shadow.camera.left = dir.shadow.camera.bottom = -60000;
  dir.shadow.camera.right = dir.shadow.camera.top = 60000;
  dir.shadow.camera.far = 120000;
  dir.shadow.bias = -0.0001;
  scene.add(dir);

  const fill = new THREE.DirectionalLight(0xa0c8ff, 0.6);
  fill.position.set(-8000, 6000, -6000);
  scene.add(fill);

  const bounce = new THREE.DirectionalLight(0xffffff, 0.2);
  bounce.position.set(0, -5000, 0);
  scene.add(bounce);

  // 그리드 (CAD 느낌 - 얇고 정밀한)
  const grid = new THREE.GridHelper(100000, 80, 0x2a2f3d, 0x232838);
  grid.position.y = -2;
  scene.add(grid);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  buildAllContainers();
  rebuildMeshes();
  setupEvents(canvas);
  onResize();
  window.addEventListener('resize', onResize);
  animate();
}

function onResize() {
  const vp = document.querySelector('.viewport-wrap');
  renderer.setSize(vp.clientWidth, vp.clientHeight);
  camera.aspect = vp.clientWidth / vp.clientHeight;
  camera.updateProjectionMatrix();
}

function updateCamera() {
  const x = camTarget.x + camRadius * Math.sin(camPhi) * Math.sin(camTheta);
  const y = camTarget.y + camRadius * Math.cos(camPhi);
  const z = camTarget.z + camRadius * Math.sin(camPhi) * Math.cos(camTheta);
  camera.position.set(x, y, z);
  camera.lookAt(camTarget.x, camTarget.y, camTarget.z);
}

function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); }

// 컨테이너 i번의 월드 X 오프셋
function contOffsetX(idx) {
  return 0; // X는 항상 0 (세로 배치)
}
function contOffsetZ(idx) {
  const c = CONTAINERS[state.containerType];
  return idx * (c.iD + 80*2 + CONT_SPACING); // Z축으로 세로 배치
}

// ─── CONTAINER BUILD ──────────────────────────────────────────

// 골판 텍스처 (세로 리브)
function makeCorrugateTex(baseColor, ribColor, ribWidth, period) {
  const W = 512, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += period) {
    const g = ctx.createLinearGradient(x, 0, x + period, 0);
    g.addColorStop(0,              'rgba(0,0,0,0)');
    g.addColorStop(ribWidth*0.3,   ribColor);
    g.addColorStop(ribWidth*0.5,   ribColor);
    g.addColorStop(ribWidth,       'rgba(0,0,0,0)');
    g.addColorStop(1,              'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, period, H);
  }
  // 수평 줄 (용접선)
  for (let y = 0; y < H; y += 40) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, y, W, 1);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 목재 바닥 텍스처
function makeWoodTex() {
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(0, 0, W, H);
  // 목재 판자 (세로 방향)
  const plankW = W / 7;
  for (let i = 0; i < 7; i++) {
    const x = i * plankW;
    // 판자 색상 변화
    const shade = (i % 2 === 0) ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.04)';
    ctx.fillStyle = shade;
    ctx.fillRect(x, 0, plankW, H);
    // 나뭇결
    for (let g = 0; g < 6; g++) {
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + plankW * 0.1 + g * plankW * 0.12, 0);
      ctx.lineTo(x + plankW * 0.15 + g * plankW * 0.12, H);
      ctx.stroke();
    }
    // 판자 경계선
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, 0, 2, H);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

// 금속 패널 텍스처 (문)
function makeDoorTex() {
  const W = 256, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#2a3a2a';
  ctx.fillRect(0, 0, W, H);
  // 수평 리브
  for (let y = 0; y < H; y += 20) {
    const g = ctx.createLinearGradient(0, y, 0, y + 20);
    g.addColorStop(0,   'rgba(255,255,255,0.00)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.06)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.06)');
    g.addColorStop(1,   'rgba(255,255,255,0.00)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, 20);
  }
  // 도어 프레임 선
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, W/2 - 14, H - 20);
  ctx.strokeRect(W/2 + 4, 10, W/2 - 14, H - 20);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function buildAllContainers() {
  containerObjects.forEach(o => {
    if (o.group) scene.remove(o.group);
    if (o.floor) scene.remove(o.floor);
  });
  containerObjects = [];

  const c = CONTAINERS[state.containerType];
  // iW/iH/iD = 내부치수. 외부 모델은 벽두께 T만큼 더 크게
  const iW = c.iW, iH = c.iH, iD = c.iD;
  const T = 80; // 벽 두께
  // 외부 치수
  const OW = iW + T*2, OH = iH + T, OD = iD + T*2; // 바닥만 T, 나머지 양면 T*2
  const count = state.containers.length;

  // 공유 텍스처
  const sideTex = makeCorrugateTex('#2d4a2d', 'rgba(255,255,255,0.09)', 0.18, 0.055);
  const doorTex = makeDoorTex();
  const woodTex = makeWoodTex();
  woodTex.repeat.set(iW / 2400, iD / 1200);

  const STEEL = (col, rough = 0.7, metal = 0.6) =>
    new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: metal });

  state.containers.forEach((ct, idx) => {
    const ox = contOffsetX(idx);
    const oz = contOffsetZ(idx);
    const isActive = activeContIdx === idx;
    const accentCol = isActive ? 0x44cc77 : 0x335544;
    const bodyCol   = isActive ? 0x243d2a : 0x1a2e20;

    const group = new THREE.Group();
    // group 원점 = 내부 바닥 중심 (부품 좌표계와 일치)
    group.position.set(0, 0, oz);
    scene.add(group);

    // ── 바닥 (목재) — Y: -T ~ 0 ─────────────────────────
    const floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(iW, T, iD),
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9, metalness: 0.0, color: 0x6b4423 })
    );
    floorMesh.position.set(0, -T/2, 0);
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // raycast용 투명 floor — Y=1 (내부 바닥면 바로 위)
    const floorHit = new THREE.Mesh(
      new THREE.PlaneGeometry(iW, iD),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    floorHit.rotation.x = -Math.PI / 2;
    floorHit.position.set(0, 1, 0);
    floorHit.name = 'floor_' + idx;
    floorHit.userData.contIdx = idx;
    group.add(floorHit);

    // ── 좌/우 측벽 (Z축 양쪽) — 내부 기준 ±iD/2 위치 ──
    [iD/2 + T/2, -(iD/2 + T/2)].forEach(zPos => {
      const t = sideTex.clone(); t.needsUpdate = true;
      t.repeat.set(iW / 500, iH / 300);
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(iW + T*2, iH, T),
        new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, metalness: 0.45, color: bodyCol })
      );
      wall.position.set(0, iH/2, zPos);
      wall.castShadow = true;
      group.add(wall);
    });

    // ── 앞벽 (X- 방향) ───────────────────────────────────
    const frontTex = sideTex.clone(); frontTex.needsUpdate = true;
    frontTex.repeat.set(iD / 500, iH / 300);
    const frontWall = new THREE.Mesh(
      new THREE.BoxGeometry(T, iH, iD),
      new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.75, metalness: 0.45, color: bodyCol })
    );
    frontWall.position.set(-(iW/2 + T/2), iH/2, 0);
    frontWall.castShadow = true;
    group.add(frontWall);

    // ── 뒷면 문 (X+ 방향) ────────────────────────────────
    const dt = doorTex.clone(); dt.needsUpdate = true;
    dt.repeat.set(2, 1);
    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(T, iH, iD),
      new THREE.MeshStandardMaterial({ map: dt, roughness: 0.6, metalness: 0.5, color: bodyCol })
    );
    doorPanel.position.set(iW/2 + T/2, iH/2, 0);
    doorPanel.castShadow = true;
    group.add(doorPanel);

    // ── 코너 포스트 4개 ──────────────────────────────────
    const postMat = STEEL(accentCol, 0.45, 0.75);
    const postGeo = new THREE.BoxGeometry(T, iH + T, T);
    [[-iW/2 - T/2,  iD/2 + T/2],
     [-iW/2 - T/2, -iD/2 - T/2],
     [ iW/2 + T/2,  iD/2 + T/2],
     [ iW/2 + T/2, -iD/2 - T/2]].forEach(([px, pz]) => {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, iH/2 - T/2, pz);
      post.castShadow = true;
      group.add(post);
    });

    // 상단 레일 없음 — 내용물이 잘 보이도록

    // ── 하단 레일 ────────────────────────────────────────
    const railMat = STEEL(accentCol, 0.5, 0.8);
    [iD/2 + T/2, -(iD/2 + T/2)].forEach(rz => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(OW, T*0.5, T*0.5), railMat);
      rail.position.set(0, -T*0.75, rz);
      group.add(rail);
    });
    [-(iW/2 + T/2), iW/2 + T/2].forEach(rx => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(T*0.5, T*0.5, OD), railMat);
      rail.position.set(rx, -T*0.75, 0);
      group.add(rail);
    });

    // 활성 표시: glow 제거, 코너 포스트 색상으로만 구분

    // ── 번호 라벨 ────────────────────────────────────────
    const lc = document.createElement('canvas');
    lc.width = 256; lc.height = 128;
    const lctx = lc.getContext('2d');
    lctx.fillStyle = isActive ? '#22ff88' : '#aabbcc';
    lctx.font = 'bold 72px monospace';
    lctx.textAlign = 'center'; lctx.textBaseline = 'middle';
    lctx.fillText('#' + (idx+1), 128, 64);
    const labelTex = new THREE.CanvasTexture(lc);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 300),
      new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false })
    );
    label.position.set(-iW/2 + 300, iH - 400, iD/2 + T + 10); // Z 오프셋은 group에 적용됨
    group.add(label);

    containerObjects.push({ group, floor: floorHit });
  });

  // 카메라 타겟 — 세로 배치 중심
  const totalD = (count - 1) * (iD + T*2 + CONT_SPACING);
  camTarget = { x: 0, y: iH / 2, z: totalD / 2 };
  camRadius = Math.max(20000, Math.max(iW, totalD) * 1.5 + 20000);
  updateCamera();
  updateHUD();
}

// ─── MESH ─────────────────────────────────────────────────────

function makeMesh(p, x, y, z, orient, contIdx) {
  // pp.x/y/z = 부품 중심 (원래 코드와 동일)
  const dims = getOrientedDims(p, orient || 'flat');
  const bW = dims.w, bH = dims.h, bD = dims.d;
  const color = parseInt(getPartColor(p.code).replace('#', ''), 16);

  const T = Math.max(25, Math.min(60, Math.min(bW, bD) * 0.04));

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x7a8fa0, roughness: 0.3, metalness: 0.9 });
  const baseMat  = new THREE.MeshStandardMaterial({ color: 0x3a4a55, roughness: 0.6, metalness: 0.8 });
  const metalMap = { A:0.6, B:0.7, C:0.5, D:0.5, E:0.5, F:0.4, G:0.3, H:0.75 };
  const roughMap = { A:0.35, B:0.25, C:0.45, D:0.45, E:0.45, F:0.5, G:0.6, H:0.3 };
  const partMat = new THREE.MeshPhysicalMaterial({
    color, roughness: roughMap[p.code] ?? 0.4, metalness: metalMap[p.code] ?? 0.5,
    reflectivity: 0.8, clearcoat: 0.2, clearcoatRoughness: 0.2,
  });

  const group = new THREE.Group();

  // ── 좌표계: group 중심 = 부품 중심 ──────────────────────────
  //    X: -bW/2 ~ +bW/2
  //    Y: -bH/2 ~ +bH/2  (바닥 = -bH/2, 상단 = +bH/2)
  //    Z: -bD/2 ~ +bD/2

  const addBeam = (w, h, d, px, py, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    m.position.set(px, py, pz);
    m.castShadow = true;
    group.add(m);
  };

  const y0 = -bH/2, y1 = bH/2; // 하단, 상단 Y

  // 수직 코너 기둥 4개 (중심 Y=0, 전체 높이 bH)
  const hx = bW/2 - T/2, hz = bD/2 - T/2;
  [[-hx,-hz],[-hx,hz],[hx,-hz],[hx,hz]].forEach(([px,pz]) => addBeam(T, bH, T, px, 0, pz));

  // 하단 수평 빔
  const yb = y0 + T/2;
  addBeam(bW-T*2, T, T,  0,  yb, -bD/2+T/2);
  addBeam(bW-T*2, T, T,  0,  yb,  bD/2-T/2);
  addBeam(T, T, bD-T*2, -bW/2+T/2, yb, 0);
  addBeam(T, T, bD-T*2,  bW/2-T/2, yb, 0);

  // 상단 수평 빔
  const yt = y1 - T/2;
  addBeam(bW-T*2, T, T,  0,  yt, -bD/2+T/2);
  addBeam(bW-T*2, T, T,  0,  yt,  bD/2-T/2);
  addBeam(T, T, bD-T*2, -bW/2+T/2, yt, 0);
  addBeam(T, T, bD-T*2,  bW/2-T/2, yt, 0);

  // 중간 보강 빔 (-bH/6, +bH/6)
  [-bH/6, bH/6].forEach(hy => {
    const bt = T * 0.65;
    addBeam(bW-T*2, bt, bt,  0,          hy, -bD/2+T/2);
    addBeam(bW-T*2, bt, bt,  0,          hy,  bD/2-T/2);
    addBeam(bt, bt, bD-T*2, -bW/2+T/2,   hy, 0);
    addBeam(bt, bt, bD-T*2,  bW/2-T/2,   hy, 0);
  });

  // 바닥 철판 (하단 빔 바로 위)
  const base = new THREE.Mesh(new THREE.BoxGeometry(bW-T*2, T*0.4, bD-T*2), baseMat);
  base.position.set(0, y0 + T*1.2, 0);
  base.receiveShadow = true;
  group.add(base);

  // 케이지 윤곽 엣지라인 (중심=0, 크기=bW×bH×bD → 정확히 바운딩과 일치)
  group.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(bW, bH, bD)),
    new THREE.LineBasicMaterial({ color: 0xaaccee, transparent: true, opacity: 0.4 })
  ));

  // ── 내부 콘텐츠 ───────────────────────────────────────────────
  const pnlW = bW-T*2, pnlH = bH-T*2, pnlD = bD-T*2;

  if (p.code === 'C2' || p.code === 'E2' || p.code === 'G') {
    // 긴 축 방향으로 판넬들이 나란히 세워진 형태
    // E2는 판넬 방향 90도 회전, G는 관 형태(별도 처리)
    const alongX = p.code === 'E2' ? pnlW < pnlD : pnlW >= pnlD;

    if (p.code === 'G') {
      // ── 누름바: 관(tube) 형태로 빽빽하게 채움 ──────────────────
      // 긴 축 방향으로 누운 관들이 격자 배열
      const TUBE_W = 135, TUBE_H = 40; // 누름바 단면
      const GAP = 6;
      const TUBE_L = alongX ? pnlW : pnlD; // 관 길이

      const colsA = Math.max(1, Math.floor((alongX ? pnlD : pnlW) / (TUBE_W + GAP)));
      const colsB = Math.max(1, Math.floor(pnlH / (TUBE_H + GAP)));
      const totalA = colsA * TUBE_W + (colsA - 1) * GAP;
      const totalB = colsB * TUBE_H + (colsB - 1) * GAP;
      const startA = -totalA / 2 + TUBE_W / 2;
      const startB = -totalB / 2 + TUBE_H / 2;

      const tubeMat = new THREE.MeshPhysicalMaterial({
        color, roughness: 0.35, metalness: 0.75,
        clearcoat: 0.2, clearcoatRoughness: 0.2,
      });
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });

      const tubeGeo = alongX
        ? new THREE.BoxGeometry(TUBE_L, TUBE_H, TUBE_W)
        : new THREE.BoxGeometry(TUBE_W, TUBE_H, TUBE_L);
      const edgeGeo = new THREE.EdgesGeometry(tubeGeo);

      for (let ci = 0; ci < colsA; ci++) {
        for (let cj = 0; cj < colsB; cj++) {
          const a = startA + ci * (TUBE_W + GAP);
          const b = startB + cj * (TUBE_H + GAP);
          const tube = new THREE.Mesh(tubeGeo, tubeMat);
          tube.position.set(alongX ? 0 : a, b, alongX ? a : 0);
          tube.castShadow = true;
          tube.receiveShadow = true;
          tube.add(new THREE.LineSegments(edgeGeo, edgeMat));
          group.add(tube);
        }
      }

      // 결속 밴드 2줄
      const bandMat = new THREE.MeshStandardMaterial({ color: 0xddcc55, roughness: 0.5, metalness: 0.4 });
      [-TUBE_L * 0.25, TUBE_L * 0.25].forEach(bpos => {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(
            alongX ? 14 : totalA + GAP,
            totalB + GAP,
            alongX ? totalA + GAP : 14
          ), bandMat
        );
        band.position.set(alongX ? bpos : 0, 0, alongX ? 0 : bpos);
        group.add(band);
      });

    } else {
    // C2 / E2: 판넬 형태
    const PANEL_T = 20;
    const GAP     = 8;
    const PANEL_L = alongX ? pnlW : pnlD;
    const PANEL_H = pnlH;
    const secLen  = alongX ? pnlD : pnlW;

    const count = Math.max(1, Math.floor(secLen / (PANEL_T + GAP)));
    const total = count * PANEL_T + (count - 1) * GAP;
    const start = -total / 2 + PANEL_T / 2;

    const panelMat = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.3, metalness: 0.8,
      clearcoat: 0.3, clearcoatRoughness: 0.15,
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });

    const slabGeo = alongX
      ? new THREE.BoxGeometry(PANEL_L, PANEL_H, PANEL_T)
      : new THREE.BoxGeometry(PANEL_T, PANEL_H, PANEL_L);
    const edgeGeo = new THREE.EdgesGeometry(slabGeo);

    for (let i = 0; i < count; i++) {
      const pos = start + i * (PANEL_T + GAP);
      const slab = new THREE.Mesh(slabGeo, panelMat);
      slab.position.set(alongX ? 0 : pos, 0, alongX ? pos : 0);
      slab.castShadow = true;
      slab.receiveShadow = true;
      slab.add(new THREE.LineSegments(edgeGeo, edgeMat));
      group.add(slab);
    }

    const bandMat2 = new THREE.MeshStandardMaterial({ color: 0xddcc55, roughness: 0.5, metalness: 0.4 });
    [-PANEL_L * 0.25, PANEL_L * 0.25].forEach(bpos => {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(
          alongX ? 14 : total + GAP,
          PANEL_H + GAP,
          alongX ? total + GAP : 14
        ), bandMat2
      );
      band.position.set(alongX ? bpos : 0, 0, alongX ? 0 : bpos);
      group.add(band);
    });
    } // end C2/E2

  } else {
    // ── 일반 부품: 단색 판넬 ─────────────────────────────────────
    const panelGeo = new THREE.BoxGeometry(pnlW, pnlH, pnlD);
    const panel = new THREE.Mesh(panelGeo, partMat);
    panel.position.set(0, 0, 0);
    panel.castShadow = true;
    panel.receiveShadow = true;
    panel.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(panelGeo),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 })
    ));
    group.add(panel);
  }

  // 원래와 동일: group.position = 부품 중심
  group.position.set(x, y, z);
  group.userData.contIdx = contIdx;
  return group;
}
function rebuildMeshes() {
  Object.values(meshMap).forEach(m => scene.remove(m));
  meshMap = {};
  state.containers.forEach((ct, idx) => {
    const oz = contOffsetZ(idx);
    ct.placedParts.forEach(pp => {
      const p = PARTS_DEF.find(x => x.code === pp.code);
      if (!p) return;
      const mesh = makeMesh(p, pp.x, pp.y, pp.z + oz, pp.orient, idx);
      mesh.userData.id = pp.id;
      mesh.userData.contIdx = idx;
      scene.add(mesh);
      meshMap[pp.id] = mesh;
    });
  });
  applySliceAndLayer();
}