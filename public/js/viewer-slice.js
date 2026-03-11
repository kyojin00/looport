// viewer-slice.js — 단면도 모달

// ─── 단면도 모달 ──────────────────────────────────────────────
let smScene, smCamera, smRenderer, smRaycaster, smMouse;
let smAxis = 'y';
let smValue = 0;
let smPlaying = false;
let smPlayDir = 1;
let smAnimId = null;
let smLastTime = 0;
let smMeshMap = {};       // id → mesh (모달 전용 씬)
let smHighlightId = null;

function openSliceModal() {
  const modal = document.getElementById('sliceModal');
  modal.style.display = 'flex';

  // 씬 초기화 (첫 오픈 or 재오픈)
  smInitScene();
  smSetAxis('y');
  smUpdatePartList();
}

function closeSliceModal() {
  document.getElementById('sliceModal').style.display = 'none';
  smStopPlay();
  if (smRenderer) { smRenderer.dispose(); smRenderer = null; }
  smMeshMap = {};
}

function smInitScene() {
  const canvas = document.getElementById('smCanvas');
  if (smRenderer) { smRenderer.dispose(); smRenderer = null; }
  smMeshMap = {};

  smRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  smRenderer.setPixelRatio(window.devicePixelRatio);
  smRenderer.setClearColor(0x111520);
  smRenderer.shadowMap.enabled = false;
  smRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  smRenderer.toneMappingExposure = 1.1;

  smScene = new THREE.Scene();
  smScene.background = new THREE.Color(0x111520);

  const vp = canvas.parentElement;
  const w = vp.clientWidth, h = vp.clientHeight;
  smCamera = new THREE.PerspectiveCamera(45, w / h, 10, 500000);
  smRenderer.setSize(w, h);

  // 조명
  smScene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const d1 = new THREE.DirectionalLight(0xfff5e0, 1.4);
  d1.position.set(10000, 18000, 10000); smScene.add(d1);
  const d2 = new THREE.DirectionalLight(0xa0c8ff, 0.7);
  d2.position.set(-8000, 6000, -6000); smScene.add(d2);
  const d3 = new THREE.DirectionalLight(0xffffff, 0.4);
  d3.position.set(0, -5000, 0); smScene.add(d3);

  // 그리드
  const grid = new THREE.GridHelper(100000, 80, 0x2a2f3d, 0x1e2438);
  smScene.add(grid);

  // 컨테이너 와이어프레임
  smBuildContainerWire();

  // 부품 메시 복제
  smRebuildMeshes();

  // 슬라이스 평면 (반투명)
  smBuildSlicePlane();

  // 카메라 등각 위치
  const c = CONTAINERS[state.containerType];
  const oz = contOffsetZ(activeContIdx);
  const R = Math.max(c.iW, c.iD, c.iH) * 1.6;
  smCamera.position.set(0, R * 0.6, oz + R * 0.7);
  smCamera.lookAt(0, c.iH / 2, oz);

  smRaycaster = new THREE.Raycaster();
  smMouse = new THREE.Vector2();

  // 오빗 컨트롤 (간단 구현)
  smSetupOrbit(canvas);

  // 렌더 루프
  smAnimate();
}

function smBuildContainerWire() {
  const c = CONTAINERS[state.containerType];
  state.containers.forEach((_, ci) => {
    const oz = contOffsetZ(ci);
    const geo = new THREE.BoxGeometry(c.iW, c.iH, c.iD);
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: ci === activeContIdx ? 0x38bdf8 : 0x28304a, opacity: 0.6, transparent: true })
    );
    wire.position.set(0, c.iH / 2, oz);
    smScene.add(wire);
  });
}

function smRebuildMeshes() {
  smMeshMap = {};
  const c = CONTAINERS[state.containerType];
  state.containers.forEach((ct, ci) => {
    const oz = contOffsetZ(ci);
    ct.placedParts.forEach(pp => {
      const p = PARTS_DEF.find(x => x.code === pp.code);
      if (!p) return;
      const dims = getOrientedDims(p, pp.orient || 'flat');
      const color = parseInt(getPartColor(p.code).replace('#', ''), 16);
      const mat = new THREE.MeshPhysicalMaterial({
        color, roughness: 0.4, metalness: 0.5,
        transparent: true, opacity: 1.0,
      });
      const geo = new THREE.BoxGeometry(dims.w, dims.h, dims.d);
      const mesh = new THREE.Mesh(geo, mat);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 })
      );
      mesh.add(edges);
      mesh.position.set(pp.x, pp.y, pp.z + oz);
      mesh.userData.id = pp.id;
      mesh.userData.contIdx = ci;
      smScene.add(mesh);
      smMeshMap[pp.id] = mesh;
    });
  });
}

let smSlicePlane = null;
function smBuildSlicePlane() {
  if (smSlicePlane) { smScene.remove(smSlicePlane); smSlicePlane = null; }
  const c = CONTAINERS[state.containerType];
  const oz = contOffsetZ(activeContIdx);
  let geo;
  if (smAxis === 'x') geo = new THREE.PlaneGeometry(c.iH * 1.1, c.iD * 1.1);
  else if (smAxis === 'y') geo = new THREE.PlaneGeometry(c.iW * 1.1, c.iD * 1.1);
  else geo = new THREE.PlaneGeometry(c.iW * 1.1, c.iH * 1.1);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8, transparent: true, opacity: 0.12,
    side: THREE.DoubleSide, depthWrite: false,
  });
  smSlicePlane = new THREE.Mesh(geo, mat);
  if (smAxis === 'x') { smSlicePlane.rotation.y = Math.PI / 2; smSlicePlane.position.set(smValue, c.iH / 2, oz); }
  else if (smAxis === 'y') { smSlicePlane.rotation.x = Math.PI / 2; smSlicePlane.position.set(0, smValue, oz); }
  else { smSlicePlane.position.set(0, c.iH / 2, smValue + oz); }
  smScene.add(smSlicePlane);
}

function smApplySlice() {
  const c = CONTAINERS[state.containerType];
  state.containers.forEach((ct, ci) => {
    ct.placedParts.forEach(pp => {
      const mesh = smMeshMap[pp.id];
      if (!mesh) return;
      const pos = smAxis === 'x' ? pp.x : smAxis === 'y' ? pp.y : pp.z;
      const show = pos <= smValue;
      mesh.visible = show;
      // 반투명 처리: 슬라이스 경계 부품
      if (show) {
        const dims = getOrientedDims(PARTS_DEF.find(x => x.code === pp.code), pp.orient || 'flat');
        const halfSize = smAxis === 'x' ? dims.w/2 : smAxis === 'y' ? dims.h/2 : dims.d/2;
        const isBoundary = Math.abs(pos - smValue) < halfSize * 1.5;
        mesh.material.opacity = isBoundary ? 0.55 : 1.0;
        mesh.material.transparent = isBoundary;
      }
    });
  });
  // 슬라이스 평면 위치 업데이트
  const oz = contOffsetZ(activeContIdx);
  if (smSlicePlane) {
    if (smAxis === 'x') smSlicePlane.position.set(smValue, c.iH / 2, oz);
    else if (smAxis === 'y') smSlicePlane.position.set(0, smValue, oz);
    else smSlicePlane.position.set(0, c.iH / 2, smValue + oz);
  }
  // 위치 레이블 업데이트
  document.getElementById('smPosLabel').textContent = Math.round(smValue) + ' mm';
  document.getElementById('smSlider').value = smValue;
  smUpdatePartList();
}

function smSetAxis(axis) {
  smAxis = axis;
  document.querySelectorAll('.sm-axis-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('smAxis' + axis.toUpperCase())?.classList.add('active');
  const c = CONTAINERS[state.containerType];
  let min, max;
  if (axis === 'x') { min = -c.iW/2; max = c.iW/2; smValue = 0; }
  else if (axis === 'y') { min = 0; max = c.iH; smValue = c.iH / 2; }
  else { min = -c.iD/2; max = c.iD/2; smValue = 0; }
  const slider = document.getElementById('smSlider');
  slider.min = min; slider.max = max;
  slider.step = Math.round((max - min) / 200);
  slider.value = smValue;
  document.getElementById('smMinLabel').textContent = Math.round(min) + ' mm';
  document.getElementById('smMaxLabel').textContent = Math.round(max) + ' mm';
  smBuildSlicePlane();
  smApplySlice();
}

function smOnSlider(val) {
  smValue = parseFloat(val);
  smApplySlice();
}

// 재생/정지
function smTogglePlay() {
  smPlaying = !smPlaying;
  document.getElementById('smPlayBtn').textContent = smPlaying ? '⏸ 정지' : '▶ 재생';
  if (smPlaying) smLastTime = performance.now();
}
function smStopPlay() {
  smPlaying = false;
  const btn = document.getElementById('smPlayBtn');
  if (btn) btn.textContent = '▶ 재생';
}

// 오빗 컨트롤 (모달 캔버스용)
let smOrbit = { active: false, lx: 0, ly: 0, moved: false };
let smTheta = Math.PI / 4, smPhi = Math.PI / 3.5, smRadius = 0;

function smSetupOrbit(canvas) {
  const c = CONTAINERS[state.containerType];
  smRadius = Math.max(c.iW, c.iD, c.iH) * 1.6;

  canvas.onmousedown = e => { smOrbit.active = true; smOrbit.lx = e.clientX; smOrbit.ly = e.clientY; smOrbit.moved = false; };
  window.addEventListener('mouseup', () => smOrbit.active = false);
  window.addEventListener('mousemove', e => {
    if (!smOrbit.active) return;
    const dx = e.clientX - smOrbit.lx, dy = e.clientY - smOrbit.ly;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) smOrbit.moved = true;
    smOrbit.lx = e.clientX; smOrbit.ly = e.clientY;
    smTheta -= dx * 0.005;
    smPhi = Math.max(0.05, Math.min(Math.PI * 0.48, smPhi - dy * 0.005));
    smUpdateCamera();
  });
  canvas.onwheel = e => {
    smRadius = Math.max(2000, Math.min(300000, smRadius + e.deltaY * 25));
    smUpdateCamera(); e.preventDefault();
  };
  canvas.onclick = e => {
    if (smOrbit.moved) return;
    smDoRaycastHighlight(e.clientX, e.clientY, canvas);
  };
}

function smUpdateCamera() {
  const c = CONTAINERS[state.containerType];
  const oz = contOffsetZ(activeContIdx);
  const tx = 0, ty = c.iH / 2, tz = oz;
  smCamera.position.set(
    tx + smRadius * Math.sin(smPhi) * Math.sin(smTheta),
    ty + smRadius * Math.cos(smPhi),
    tz + smRadius * Math.sin(smPhi) * Math.cos(smTheta)
  );
  smCamera.lookAt(tx, ty, tz);
}

// 클릭 → 부품 상세
function smDoRaycastHighlight(clientX, clientY, canvas) {
  const rect = canvas.getBoundingClientRect();
  smMouse.x =  ((clientX - rect.left) / rect.width)  * 2 - 1;
  smMouse.y = -((clientY - rect.top)  / rect.height) * 2 + 1;
  smRaycaster.setFromCamera(smMouse, smCamera);
  const visibleMeshes = Object.values(smMeshMap).filter(m => m && m.visible);
  const hits = smRaycaster.intersectObjects(visibleMeshes, true);
  if (!hits.length) { smClearHighlight(); return; }
  let obj = hits[0].object;
  let id = obj.userData.id;
  while (id === undefined && obj.parent) { obj = obj.parent; id = obj.userData.id; }
  if (id !== undefined) smSetHighlight(id);
}

function smSetHighlight(id) {
  // 이전 하이라이트 해제
  if (smHighlightId !== null && smMeshMap[smHighlightId]) {
    smMeshMap[smHighlightId].material.emissive = new THREE.Color(0);
    smMeshMap[smHighlightId].material.emissiveIntensity = 0;
  }
  smHighlightId = id;
  const mesh = smMeshMap[id];
  if (!mesh) return;
  mesh.material.emissive = new THREE.Color(0xffffff);
  mesh.material.emissiveIntensity = 0.3;
  smShowPartDetail(id);
}

function smClearHighlight() {
  if (smHighlightId !== null && smMeshMap[smHighlightId]) {
    smMeshMap[smHighlightId].material.emissive = new THREE.Color(0);
    smMeshMap[smHighlightId].material.emissiveIntensity = 0;
  }
  smHighlightId = null;
}

function smShowPartDetail(id) {
  let pp = null, contIdx = -1;
  state.containers.forEach((ct, ci) => {
    const found = ct.placedParts.find(p => p.id === id);
    if (found) { pp = found; contIdx = ci; }
  });
  if (!pp) return;
  const p = PARTS_DEF.find(x => x.code === pp.code);
  const dims = getOrientedDims(p, pp.orient || 'flat');
  const vol = (dims.w * dims.h * dims.d / 1e9).toFixed(4);
  const layerApprox = dims.h > 0 ? Math.ceil(pp.y / dims.h) : 1;
  const color = getPartColor(p.code);

  document.getElementById('smPartDetail').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="width:36px;height:36px;border-radius:6px;background:${color};flex-shrink:0;box-shadow:0 0 12px ${color}55"></div>
      <div>
        <div style="font-size:16px;font-weight:700;color:${color}">${p.code}</div>
        <div style="font-size:12px;color:var(--text)">${p.name}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;font-family:var(--font-mono)">
      <tr><td style="color:var(--text-dim);padding:4px 0;width:80px">재질</td><td style="color:var(--text)">${p.mat}</td></tr>
      <tr><td style="color:var(--text-dim);padding:4px 0">원본 치수</td><td style="color:var(--text)">${p.w}×${p.h}×${p.d} mm</td></tr>
      <tr><td style="color:var(--text-dim);padding:4px 0">배치 치수</td><td style="color:var(--accent)">${dims.w}×${dims.h}×${dims.d} mm</td></tr>
      <tr><td style="color:var(--text-dim);padding:4px 0">방향</td><td style="color:var(--text)">${ORIENTATIONS[pp.orient]?.label || pp.orient}</td></tr>
      <tr><td style="color:var(--text-dim);padding:4px 0">X 위치</td><td style="color:var(--text)">${Math.round(pp.x)} mm</td></tr>
      <tr><td style="color:var(--text-dim);padding:4px 0">Y 위치</td><td style="color:var(--text)">${Math.round(pp.y)} mm</td></tr>
      <tr><td style="color:var(--text-dim);padding:4px 0">Z 위치</td><td style="color:var(--text)">${Math.round(pp.z)} mm</td></tr>
      <tr><td style="color:var(--text-dim);padding:4px 0">체적</td><td style="color:var(--green)">${vol} m³</td></tr>
      <tr><td style="color:var(--text-dim);padding:4px 0">컨테이너</td><td style="color:var(--accent)">#${contIdx + 1}</td></tr>
    </table>
  `;
}

function smUpdatePartList() {
  const ct = state.containers[activeContIdx];
  const visible = ct.placedParts.filter(pp => {
    const pos = smAxis === 'x' ? pp.x : smAxis === 'y' ? pp.y : pp.z;
    return pos <= smValue;
  });
  // 코드별 집계
  const counts = {};
  visible.forEach(pp => { counts[pp.code] = (counts[pp.code] || 0) + 1; });
  const listEl = document.getElementById('smPartList');
  if (!listEl) return;
  if (!Object.keys(counts).length) {
    listEl.innerHTML = '<div style="color:var(--text-dim);font-size:11px;padding:6px 4px">없음</div>';
    return;
  }
  listEl.innerHTML = Object.entries(counts).map(([code, cnt]) => {
    const p = PARTS_DEF.find(x => x.code === code);
    const color = getPartColor(code);
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:1px solid var(--border)">
      <div style="width:8px;height:8px;border-radius:2px;background:${color};flex-shrink:0"></div>
      <span style="font-family:var(--font-mono);font-size:11px;color:${color};font-weight:700">${code}</span>
      <span style="font-size:11px;color:var(--text-dim);flex:1">${p?.name}</span>
      <span style="font-family:var(--font-mono);font-size:11px;color:var(--text)">${cnt}개</span>
    </div>`;
  }).join('');
}

// 애니메이션 루프
function smAnimate(now = 0) {
  smAnimId = requestAnimationFrame(smAnimate);
  if (!smRenderer) return;

  // 재생 중이면 슬라이더 자동 이동
  if (smPlaying) {
    const dt = (now - smLastTime) / 1000;
    smLastTime = now;
    const speed = parseFloat(document.getElementById('smSpeed')?.value || '1');
    const c = CONTAINERS[state.containerType];
    let range, step;
    if (smAxis === 'x') { range = c.iW; step = range / 8 * speed * dt; }
    else if (smAxis === 'y') { range = c.iH; step = range / 8 * speed * dt; }
    else { range = c.iD; step = range / 8 * speed * dt; }

    smValue += step * smPlayDir;
    const slider = document.getElementById('smSlider');
    const min = parseFloat(slider.min), max = parseFloat(slider.max);
    if (smValue >= max) { smValue = max; smPlayDir = -1; }
    if (smValue <= min) { smValue = min; smPlayDir = 1; }
    smApplySlice();
  }

  const canvas = document.getElementById('smCanvas');
  if (canvas) {
    const vp = canvas.parentElement;
    if (smCamera && (smCamera.aspect !== vp.clientWidth / vp.clientHeight)) {
      smCamera.aspect = vp.clientWidth / vp.clientHeight;
      smCamera.updateProjectionMatrix();
      smRenderer.setSize(vp.clientWidth, vp.clientHeight);
    }
  }
  smUpdateCamera();
  smRenderer.render(smScene, smCamera);
}

// ─── INIT (모든 스크립트 로드 후 실행) ───────────────────────
initThree();
renderContainerTabs();
renderPartPicker();
renderPlacedList();
updateStats();
buildLayerToggles();