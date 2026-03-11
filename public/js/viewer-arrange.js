// viewer-arrange.js — 충돌 감지, 배치, 컨테이너 관리, 자동배치

// ─── COLLISION (컨테이너 로컬 좌표 기준) ─────────────────────
const EPS = 0.1;

function getAABB(pp) {
  const p = PARTS_DEF.find(x => x.code === pp.code);
  if (!p) return null;
  const dims = getOrientedDims(p, pp.orient || 'flat');
  return {
    minX: pp.x - dims.w / 2, maxX: pp.x + dims.w / 2,
    minY: pp.y - dims.h / 2, maxY: pp.y + dims.h / 2,
    minZ: pp.z - dims.d / 2, maxZ: pp.z + dims.d / 2,
  };
}

function overlaps(a, b) {
  return (a.maxX - EPS) > b.minX && (a.minX + EPS) < b.maxX &&
         (a.maxY - EPS) > b.minY && (a.minY + EPS) < b.maxY &&
         (a.maxZ - EPS) > b.minZ && (a.minZ + EPS) < b.maxZ;
}


function isOutOfContainer(aabb, c) {
  const EPS2 = 1; // 부동소수점 오차 허용
  return aabb.minX < -(c.iW/2 + EPS2) || aabb.maxX > (c.iW/2 + EPS2) ||
         aabb.minZ < -(c.iD/2 + EPS2) || aabb.maxZ > (c.iD/2 + EPS2) ||
         aabb.minY < -EPS2             || aabb.maxY > (c.iH   + EPS2);
}

// ─── PLACEMENT ────────────────────────────────────────────────

function removePart(id) {
  state.containers.forEach((ct, idx) => {
    const i = ct.placedParts.findIndex(pp => pp.id === id);
    if (i >= 0) {
      ct.placedParts.splice(i, 1);
      scene.remove(meshMap[id]);
      delete meshMap[id];
    }
  });
  saveState(state);
  updateStats();
  renderPartPicker();
  renderPlacedList();
}

function clearAll() {
  const ct = state.containers[activeContIdx];

  // 활성 컨테이너 메시만 제거
  ct.placedParts.forEach(pp => {
    if (meshMap[pp.id]) { scene.remove(meshMap[pp.id]); delete meshMap[pp.id]; }
  });
  // 고아 메시 정리 (같은 컨테이너 소속만)
  const toRemove = [];
  scene.traverse(obj => {
    if (obj.userData?.id !== undefined && obj.userData?.contIdx === activeContIdx) toRemove.push(obj);
  });
  toRemove.forEach(obj => { if (obj.parent) obj.parent.remove(obj); });

  // 배치 + 수량 모두 0으로 리셋
  ct.placedParts = [];
  ct.userQty = {};
  PARTS_DEF.forEach(p => { ct.userQty[p.code] = 0; });
  state.userQty = { ...ct.userQty };

  saveState(state);
  buildAllContainers();
  rebuildMeshes();
  updateStats();
  updateHUD();
  renderContainerTabs();
  renderPartPicker();
  renderPlacedList();
  buildLayerToggles();
  showToast(`#${activeContIdx + 1} 컨테이너 초기화 완료`);
}

// ─── CONTAINER MANAGEMENT ─────────────────────────────────────
function addContainer() {
  if (state.containers.length >= 4) {
    showToast('컨테이너는 최대 4개까지 추가할 수 있어요');
    return;
  }
  // 현재 컨테이너 수량 저장
  const curCt = state.containers[activeContIdx];
  if (curCt) curCt.userQty = { ...state.userQty };
  const newCt = defaultContainerState();
  newCt.userQty = { ...(state.userQty ?? {}) };
  state.containers.push(newCt);
  saveState(state);
  buildAllContainers();
  rebuildMeshes();
  renderContainerTabs();
  renderPlacedList();
  updateStats();
}

function removeContainer(idx) {
  if (state.containers.length <= 1) {
    showToast('컨테이너는 최소 1개 있어야 해요');
    return;
  }
  // 해당 컨테이너의 메시 제거
  state.containers[idx].placedParts.forEach(pp => {
    scene.remove(meshMap[pp.id]);
    delete meshMap[pp.id];
  });
  state.containers.splice(idx, 1);
  if (activeContIdx >= state.containers.length) activeContIdx = state.containers.length - 1;
  saveState(state);
  buildAllContainers();
  rebuildMeshes();
  renderContainerTabs();
  renderPlacedList();
  updateStats();
}

function selectContainer(idx) {
  activeContIdx = idx;

  // 컨테이너별 수량이 저장돼 있으면 로드, 없으면 현재 수량 유지
  const ct = state.containers[idx];
  if (ct.userQty && Object.keys(ct.userQty).length > 0) {
    state.userQty = { ...ct.userQty };
  }
  // 신규 부품 누락분 보정
  PARTS_DEF.forEach(p => {
    if (!state.userQty) state.userQty = {};
    if (state.userQty[p.code] === undefined) state.userQty[p.code] = 0;
    if (!state.userOrient) state.userOrient = {};
    if (state.userOrient[p.code] === undefined) state.userOrient[p.code] = 'flat';
  });

  // 슬라이스/필터 초기화
  visibleCodes = null;
  sliceAxis = null;
  document.querySelectorAll('.slice-btn').forEach(b => b.classList.remove('active'));
  const sw = document.getElementById('sliceSliderWrap');
  if (sw) sw.style.display = 'none';
  // 컨테이너 외관 재구성
  buildAllContainers();
  rebuildMeshes();
  renderContainerTabs();
  renderPartPicker();
  renderPlacedList();
  updateHUD();
  buildLayerToggles();
  if (typeof rsDrawMinimap === 'function') rsDrawMinimap();
  // 선택한 컨테이너로 카메라 이동
  const c = CONTAINERS[state.containerType];
  const oz = contOffsetZ(idx);
  camTarget = { x: 0, y: c.iH / 2, z: oz };
  updateCamera();
}

function renderContainerTabs() {
  const el = document.getElementById('contTabs');
  if (!el) return;
  el.innerHTML = state.containers.map((ct, idx) => `
    <div class="cont-tab ${activeContIdx === idx ? 'active' : ''}" onclick="selectContainer(${idx})">
      <span class="cont-tab-label">#${idx+1} ${state.containerType}</span>
      <span class="cont-tab-count">${ct.placedParts.length}개</span>
      ${state.containers.length > 1 ? `<button class="cont-tab-rm" onclick="event.stopPropagation();removeContainer(${idx})">×</button>` : ''}
    </div>
  `).join('') + (state.containers.length < 4 ? `
    <button class="cont-add-btn" onclick="addContainer()">＋ 컨테이너 추가</button>
  ` : '');
}

// ─── AUTO ARRANGE ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
// 적재 최적화 분석 — 공통 유틸
// ══════════════════════════════════════════════════════════════

function buildItems(c, userQty, userOrient) {
  const items = [];
  PARTS_DEF.forEach(p => {
    const qty = userQty[p.code] ?? 0;
    if (!qty) return;
    const orient = userOrient[p.code] || 'flat';
    const dims = getOrientedDims(p, orient);
    for (let i = 0; i < qty; i++)
      items.push({ p, preferOrient: orient, area: dims.w * dims.d, dims });
  });
  items.sort((a, b) => b.area - a.area || b.dims.h - a.dims.h);
  return items;
}

function tryPlace(aabb, c, maxH, placed) {
  if (aabb.maxX > c.iW/2 + 0.5 || aabb.minX < -c.iW/2 - 0.5) return false;
  if (aabb.maxZ > c.iD/2 + 0.5 || aabb.minZ < -c.iD/2 - 0.5) return false;
  if (aabb.maxY > maxH + 0.5 || aabb.minY < -0.5) return false;
  for (const pp of placed) {
    const p2 = PARTS_DEF.find(x => x.code === pp.code);
    if (!p2) continue;
    const d2 = getOrientedDims(p2, pp.orient || 'flat');
    const bb = { minX: pp.x-d2.w/2, maxX: pp.x+d2.w/2, minY: pp.y-d2.h/2, maxY: pp.y+d2.h/2, minZ: pp.z-d2.d/2, maxZ: pp.z+d2.d/2 };
    if (overlaps(aabb, bb)) return false;
  }
  return true;
}

function calcVolume(placedList) {
  let vol = 0;
  placedList.forEach(pp => {
    const p = PARTS_DEF.find(x => x.code === pp.code);
    if (!p) return;
    const d = getOrientedDims(p, pp.orient || 'flat');
    vol += d.w * d.h * d.d;
  });
  return vol;
}

// ── HeightMap 공통 헬퍼 ────────────────────────────────────────
function makeHM(c) {
  const STEP = 10;
  const nx = Math.ceil(c.iW / STEP) + 1;
  const nz = Math.ceil(c.iD / STEP) + 1;
  const hmap = new Float32Array(nx * nz);
  const xO = -c.iW/2, zO = -c.iD/2;
  const get = (minX, maxX, minZ, maxZ) => {
    let h = 0;
    const ix0=Math.max(0,Math.floor((minX-xO)/STEP)), ix1=Math.min(nx-1,Math.ceil((maxX-xO)/STEP));
    const iz0=Math.max(0,Math.floor((minZ-zO)/STEP)), iz1=Math.min(nz-1,Math.ceil((maxZ-zO)/STEP));
    for (let ix=ix0;ix<=ix1;ix++) for (let iz=iz0;iz<=iz1;iz++) { const v=hmap[ix*nz+iz]; if(v>h) h=v; }
    return h;
  };
  const set = (minX, maxX, minZ, maxZ, topY) => {
    const ix0=Math.max(0,Math.floor((minX-xO)/STEP)), ix1=Math.min(nx-1,Math.ceil((maxX-xO)/STEP));
    const iz0=Math.max(0,Math.floor((minZ-zO)/STEP)), iz1=Math.min(nz-1,Math.ceil((maxZ-zO)/STEP));
    for (let ix=ix0;ix<=ix1;ix++) for (let iz=iz0;iz<=iz1;iz++) if(topY>hmap[ix*nz+iz]) hmap[ix*nz+iz]=topY;
  };
  return { get, set };
}

// ── Column-First ──────────────────────────────────────────────
function runColumnFirst(c, maxH, items) {
  const placed = [];
  const hm = makeHM(c);
  items.forEach(({ p, preferOrient }) => {
    const sorted = [preferOrient, ...Object.keys(ORIENTATIONS).filter(k => k !== preferOrient)];
    let ok = false;
    for (const orientKey of sorted) {
      if (ok) break;
      const { w:dw, h:dh, d:dd } = getOrientedDims(p, orientKey);
      if (dw > c.iW || dd > c.iD || dh > maxH) continue;
      const xSlots = [], zSlots = [];
      for (let lx=-c.iW/2+dw/2; lx+dw/2<=c.iW/2+0.5; lx+=dw) xSlots.push(lx);
      for (let lz=-c.iD/2+dd/2; lz+dd/2<=c.iD/2+0.5; lz+=dd) zSlots.push(lz);
      const cands = [];
      for (const lx of xSlots) for (const lz of zSlots) {
        const floor = hm.get(lx-dw/2, lx+dw/2, lz-dd/2, lz+dd/2);
        if (floor+dh > maxH+0.5) continue;
        cands.push({ lx, ly: floor+dh/2, lz, floor });
      }
      cands.sort((a,b) => Math.abs(a.lx-b.lx)>1?a.lx-b.lx : Math.abs(a.lz-b.lz)>1?a.lz-b.lz : a.floor-b.floor);
      for (const { lx,ly,lz } of cands) {
        const aabb = { minX:lx-dw/2, maxX:lx+dw/2, minY:ly-dh/2, maxY:ly+dh/2, minZ:lz-dd/2, maxZ:lz+dd/2 };
        if (!tryPlace(aabb, c, maxH, placed)) continue;
        placed.push({ id: placed.length+Math.random(), code:p.code, x:lx, y:ly, z:lz, orient:orientKey });
        hm.set(aabb.minX, aabb.maxX, aabb.minZ, aabb.maxZ, aabb.maxY);
        ok = true; break;
      }
    }
  });
  return placed;
}

// ── Guillotine ────────────────────────────────────────────────
function runGuillotine(c, maxH, items) {
  const placed = [];
  const hm = makeHM(c);
  items.forEach(({ p, preferOrient }) => {
    const sorted = [preferOrient, ...Object.keys(ORIENTATIONS).filter(k => k !== preferOrient)];
    let ok = false;
    for (const orientKey of sorted) {
      if (ok) break;
      const { w:dw, h:dh, d:dd } = getOrientedDims(p, orientKey);
      if (dw > c.iW || dd > c.iD || dh > maxH) continue;
      // 후보: STEP 격자 전체를 스캔해 floor 기준 최적 위치
      const STEP = 50;
      let best = null;
      for (let lx=-c.iW/2+dw/2; lx+dw/2<=c.iW/2+0.5; lx+=STEP) {
        for (let lz=-c.iD/2+dd/2; lz+dd/2<=c.iD/2+0.5; lz+=STEP) {
          const floor = hm.get(lx-dw/2, lx+dw/2, lz-dd/2, lz+dd/2);
          if (floor+dh > maxH+0.5) continue;
          const score = floor*1e8 + (lx+c.iW/2)*1e4 + (lz+c.iD/2);
          if (!best || score < best.score) best = { lx, lz, floor, score };
        }
      }
      if (!best) continue;
      const { lx, lz, floor } = best;
      const ly = floor + dh/2;
      const aabb = { minX:lx-dw/2, maxX:lx+dw/2, minY:ly-dh/2, maxY:ly+dh/2, minZ:lz-dd/2, maxZ:lz+dd/2 };
      if (!tryPlace(aabb, c, maxH, placed)) continue;
      placed.push({ id: placed.length+Math.random(), code:p.code, x:lx, y:ly, z:lz, orient:orientKey });
      hm.set(aabb.minX, aabb.maxX, aabb.minZ, aabb.maxZ, aabb.maxY);
      ok = true;
    }
  });
  return placed;
}

// ── MaxRects ─────────────────────────────────────────────────
function runMaxRects(c, maxH, items) {
  const placed = [];
  const hm = makeHM(c);
  items.forEach(({ p, preferOrient }) => {
    const sorted = [preferOrient, ...Object.keys(ORIENTATIONS).filter(k => k !== preferOrient)];
    let ok = false;
    for (const orientKey of sorted) {
      if (ok) break;
      const { w:dw, h:dh, d:dd } = getOrientedDims(p, orientKey);
      if (dw > c.iW || dd > c.iD || dh > maxH) continue;
      // BSSF: 여백이 가장 적은 위치 우선
      const STEP = 50;
      let best = null;
      for (let lx=-c.iW/2+dw/2; lx+dw/2<=c.iW/2+0.5; lx+=STEP) {
        for (let lz=-c.iD/2+dd/2; lz+dd/2<=c.iD/2+0.5; lz+=STEP) {
          const floor = hm.get(lx-dw/2, lx+dw/2, lz-dd/2, lz+dd/2);
          if (floor+dh > maxH+0.5) continue;
          // 남은 공간 여백 최소화 (Z방향 끝과의 거리 + X방향 끝과의 거리)
          const remZ = (c.iD/2 - (lz+dd/2));
          const remX = (c.iW/2 - (lx+dw/2));
          const score = floor*1e8 + Math.min(remX,remZ)*1e4 + (lx+c.iW/2);
          if (!best || score < best.score) best = { lx, lz, floor, score };
        }
      }
      if (!best) continue;
      const { lx, lz, floor } = best;
      const ly = floor + dh/2;
      const aabb = { minX:lx-dw/2, maxX:lx+dw/2, minY:ly-dh/2, maxY:ly+dh/2, minZ:lz-dd/2, maxZ:lz+dd/2 };
      if (!tryPlace(aabb, c, maxH, placed)) continue;
      placed.push({ id: placed.length+Math.random(), code:p.code, x:lx, y:ly, z:lz, orient:orientKey });
      hm.set(aabb.minX, aabb.maxX, aabb.minZ, aabb.maxZ, aabb.maxY);
      ok = true;
    }
  });
  return placed;
}

// ── Skyline ───────────────────────────────────────────────────
function runSkyline(c, maxH, items) {
  const placed = [];
  const hm = makeHM(c);
  items.forEach(({ p, preferOrient }) => {
    const sorted = [preferOrient, ...Object.keys(ORIENTATIONS).filter(k => k !== preferOrient)];
    let ok = false;
    for (const orientKey of sorted) {
      if (ok) break;
      const { w:dw, h:dh, d:dd } = getOrientedDims(p, orientKey);
      if (dw > c.iW || dd > c.iD || dh > maxH) continue;
      // 가장 낮은 바닥 높이 위치 우선 (균일 적재)
      const STEP = 50;
      let best = null;
      for (let lx=-c.iW/2+dw/2; lx+dw/2<=c.iW/2+0.5; lx+=STEP) {
        for (let lz=-c.iD/2+dd/2; lz+dd/2<=c.iD/2+0.5; lz+=STEP) {
          const floor = hm.get(lx-dw/2, lx+dw/2, lz-dd/2, lz+dd/2);
          if (floor+dh > maxH+0.5) continue;
          const score = floor*1e8 + (lx+c.iW/2)*1e4 + (lz+c.iD/2);
          if (!best || score < best.score) best = { lx, lz, floor, score };
        }
      }
      if (!best) continue;
      const { lx, lz, floor } = best;
      const ly = floor + dh/2;
      const aabb = { minX:lx-dw/2, maxX:lx+dw/2, minY:ly-dh/2, maxY:ly+dh/2, minZ:lz-dd/2, maxZ:lz+dd/2 };
      if (!tryPlace(aabb, c, maxH, placed)) continue;
      placed.push({ id: placed.length+Math.random(), code:p.code, x:lx, y:ly, z:lz, orient:orientKey });
      hm.set(aabb.minX, aabb.maxX, aabb.minZ, aabb.maxZ, aabb.maxY);
      ok = true;
    }
  });
  return placed;
}

// ── applyAlgoResult ───────────────────────────────────────────
function applyAlgoResult(placedList) {
  const ct = state.containers[activeContIdx];
  const removeIds = new Set(ct.placedParts.map(pp => pp.id));
  removeIds.forEach(id => { if (meshMap[id]) { scene.remove(meshMap[id]); delete meshMap[id]; } });
  ct.placedParts = [];
  const c  = CONTAINERS[state.containerType];
  const ci = activeContIdx;
  const oz = contOffsetZ(ci);
  placedList.forEach(pp => {
    const p = PARTS_DEF.find(x => x.code === pp.code);
    if (!p) return;
    const dims = getOrientedDims(p, pp.orient || 'flat');
    const aabb = { minX:pp.x-dims.w/2, maxX:pp.x+dims.w/2, minY:pp.y-dims.h/2, maxY:pp.y+dims.h/2, minZ:pp.z-dims.d/2, maxZ:pp.z+dims.d/2 };
    if (aabb.minX < -c.iW/2-5 || aabb.maxX > c.iW/2+5) return;
    if (aabb.minZ < -c.iD/2-5 || aabb.maxZ > c.iD/2+5) return;
    if (aabb.minY < -5 || aabb.maxY > c.iH+5) return;
    const id = Date.now() + Math.random();
    ct.placedParts.push({ id, code:pp.code, x:pp.x, y:pp.y, z:pp.z, orient:pp.orient });
    const mesh = makeMesh(p, pp.x, pp.y, pp.z+oz, pp.orient, ci);
    mesh.userData.id = id;
    mesh.userData.contIdx = ci;
    scene.add(mesh);
    meshMap[id] = mesh;
  });
  saveState(state); updateStats(); renderContainerTabs(); renderPartPicker(); renderPlacedList(); buildLayerToggles(); applySliceAndLayer();
}

// ── runBenchmark ──────────────────────────────────────────────
function runBenchmark() {
  const c       = CONTAINERS[state.containerType];
  const maxH    = Math.min(fillHeight, c.iH);
  const userQty = state.userQty ?? {};
  const userOrient = state.userOrient ?? {};
  const items   = buildItems(c, userQty, userOrient);

  const algos = [
    { key:'column',     label:'열 우선 배치',   fn: runColumnFirst },
    { key:'guillotine', label:'공간 분할 배치', fn: runGuillotine  },
    { key:'maxrects',   label:'잔여 공간 최적', fn: runMaxRects    },
    { key:'skyline',    label:'높이맵 적재',    fn: runSkyline     },
  ];

  window._benchResults = {};
  const results = [];
  showBenchmarkLoading(algos.map(a => a.label));

  const cVol = c.iW * c.iH * c.iD;

  function runNext(i) {
    if (i >= algos.length) {
      results.sort((a, b) => b.count - a.count);
      showBenchmarkResult(results, results[0]);
      return;
    }
    updateBenchmarkLoading(i, algos[i].label);
    setTimeout(() => {
      const placed = algos[i].fn(c, maxH, [...items]);
      const vol    = calcVolume(placed);
      const pct    = cVol > 0 ? (vol / cVol * 100).toFixed(1) : '0.0';
      results.push({ key: algos[i].key, label: algos[i].label, count: placed.length, vol, pct });
      window._benchResults[algos[i].key] = placed;
      updateBenchmarkLoading(i, algos[i].label);
      runNext(i + 1);
    }, 30);
  }
  runNext(0);
}


// ── Column-First 자동배치 (기존 autoArrange) ──────────────────
function autoArrange() {
  // 슬라이스/레이어 상태 초기화
  sliceAxis = null;
  visibleCodes = null;
  document.querySelectorAll('.slice-btn').forEach(b => b.classList.remove('active'));
  if (document.getElementById('sliceSliderWrap'))
    document.getElementById('sliceSliderWrap').style.display = 'none';

  // 현재 활성 컨테이너 초기화
  const ct = state.containers[activeContIdx];
  const removeIds = new Set(ct.placedParts.map(pp => pp.id));
  removeIds.forEach(id => {
    if (meshMap[id]) { scene.remove(meshMap[id]); delete meshMap[id]; }
  });
  const toRemove = [];
  scene.traverse(obj => {
    if (obj.userData && removeIds.has(obj.userData.id)) toRemove.push(obj);
  });
  toRemove.forEach(obj => { if (obj.parent) obj.parent.remove(obj); });
  ct.placedParts = [];

  const c  = CONTAINERS[state.containerType];
  const ci = activeContIdx;
  const oz = contOffsetZ(ci);
  const maxH = Math.min(fillHeight, c.iH);

  const userQty    = state.userQty    ?? {};
  const userOrient = state.userOrient ?? {};

  // ── 1. 아이템 목록 생성 & 정렬 ──────────────────────────────
  // 정렬 기준: 바닥 면적(w×d) 내림차순 → 같으면 높이 내림차순
  // 큰 부품을 먼저 배치해야 공간 낭비가 적음
  const items = [];
  PARTS_DEF.forEach(p => {
    const qty = userQty[p.code] ?? 0;
    if (!qty) return;
    const preferOrient = userOrient[p.code] || 'flat';
    const dims = getOrientedDims(p, preferOrient);
    for (let i = 0; i < qty; i++)
      items.push({ p, preferOrient, area: dims.w * dims.d, dims });
  });
  items.sort((a, b) => b.area - a.area || b.dims.h - a.dims.h);

  // ── 2. 실제 바닥 높이 계산 (findFloor) ──────────────────────
  // 특정 XZ 범위에서 기존 배치 부품들의 최대 상단 높이를 반환
  // → 이 높이 위에 부품을 올려야 물리적으로 올바름
  // ── 3. 격자 높이맵 (HeightMap) ──────────────────────────────
  // STEP mm 단위 격자로 XZ 평면을 나눠 각 셀의 현재 높이를 추적
  // findFloor / 충돌체크를 O(1)에 가깝게 수행
  const STEP = 10; // mm (작을수록 정밀하지만 메모리↑)
  const nx = Math.ceil(c.iW / STEP) + 1;
  const nz = Math.ceil(c.iD / STEP) + 1;
  const hmap = new Float32Array(nx * nz); // 각 격자 셀의 최대 높이

  const xOrig = -c.iW / 2; // 격자 X 원점
  const zOrig = -c.iD / 2; // 격자 Z 원점

  function hmIdx(ix, iz) { return ix * nz + iz; }

  // 특정 XZ 영역의 최대 높이 조회
  function hmGetFloor(minX, maxX, minZ, maxZ) {
    const ix0 = Math.max(0, Math.floor((minX - xOrig) / STEP));
    const ix1 = Math.min(nx - 1, Math.ceil((maxX - xOrig) / STEP));
    const iz0 = Math.max(0, Math.floor((minZ - zOrig) / STEP));
    const iz1 = Math.min(nz - 1, Math.ceil((maxZ - zOrig) / STEP));
    let h = 0;
    for (let ix = ix0; ix <= ix1; ix++)
      for (let iz = iz0; iz <= iz1; iz++)
        if (hmap[hmIdx(ix, iz)] > h) h = hmap[hmIdx(ix, iz)];
    return h;
  }

  // 배치 확정 후 해당 영역 높이 업데이트
  function hmSetFloor(minX, maxX, minZ, maxZ, topY) {
    const ix0 = Math.max(0, Math.floor((minX - xOrig) / STEP));
    const ix1 = Math.min(nx - 1, Math.ceil((maxX - xOrig) / STEP));
    const iz0 = Math.max(0, Math.floor((minZ - zOrig) / STEP));
    const iz1 = Math.min(nz - 1, Math.ceil((maxZ - zOrig) / STEP));
    for (let ix = ix0; ix <= ix1; ix++)
      for (let iz = iz0; iz <= iz1; iz++)
        if (topY > hmap[hmIdx(ix, iz)]) hmap[hmIdx(ix, iz)] = topY;
  }

  // ── 4. 메인 배치 루프 ────────────────────────────────────────
  let unplaced = 0;

  items.forEach(({ p, preferOrient }) => {
    const orientKeys    = Object.keys(ORIENTATIONS);
    const sortedOrients = [preferOrient, ...orientKeys.filter(k => k !== preferOrient)];
    let placed = false;

    for (const orientKey of sortedOrients) {
      if (placed) break;
      const dims = getOrientedDims(p, orientKey);
      const dw = dims.w, dh = dims.h, dd = dims.d;
      if (dw > c.iW || dd > c.iD || dh > maxH) continue;

      // X/Z 슬롯 생성
      const xSlots = [];
      for (let lx = -c.iW/2 + dw/2; lx + dw/2 <= c.iW/2 + 0.5; lx += dw) xSlots.push(lx);
      const zSlots = [];
      for (let lz = -c.iD/2 + dd/2; lz + dd/2 <= c.iD/2 + 0.5; lz += dd) zSlots.push(lz);

      // 후보: heightmap으로 floor 즉시 조회 (O(격자셀 수) ≈ 상수)
      const candidates = [];
      for (const lx of xSlots) {
        for (const lz of zSlots) {
          const floor = hmGetFloor(lx - dw/2, lx + dw/2, lz - dd/2, lz + dd/2);
          if (floor + dh > maxH + 0.5) continue;
          candidates.push({ lx, lz, floor, ly: floor + dh/2 });
        }
      }
      // x → z → floor 오름차순
      candidates.sort((a, b) =>
        Math.abs(a.lx - b.lx) > 1 ? a.lx - b.lx :
        Math.abs(a.lz - b.lz) > 1 ? a.lz - b.lz :
        a.floor - b.floor
      );

      for (const { lx, ly, lz } of candidates) {
        const aabb = {
          minX: lx - dw/2, maxX: lx + dw/2,
          minY: ly - dh/2, maxY: ly + dh/2,
          minZ: lz - dd/2, maxZ: lz + dd/2,
        };
        if (aabb.maxX > c.iW/2 + 0.5 || aabb.minX < -c.iW/2 - 0.5) continue;
        if (aabb.maxZ > c.iD/2 + 0.5 || aabb.minZ < -c.iD/2 - 0.5) continue;
        if (aabb.maxY > maxH + 0.5) continue;

        // 충돌 체크 (heightmap floor 위에 올리면 대부분 충돌 없음, 안전 확인)
        const collision = ct.placedParts.some(pp => {
          const bb = getAABB(pp);
          return bb && overlaps(aabb, bb);
        });
        if (collision) continue;

        // ✅ 배치 확정
        const id = Date.now() + Math.random();
        ct.placedParts.push({ id, code: p.code, x: lx, y: ly, z: lz, orient: orientKey });
        const mesh = makeMesh(p, lx, ly, lz + oz, orientKey, ci);
        mesh.userData.id = id;
        mesh.userData.contIdx = ci;
        scene.add(mesh);
        meshMap[id] = mesh;
        hmSetFloor(aabb.minX, aabb.maxX, aabb.minZ, aabb.maxZ, aabb.maxY);

        placed = true;
        break;
      }
    }

    if (!placed) {
      unplaced++;
    }
  });

  if (unplaced > 0) showToast(`⚠️ 공간 부족으로 ${unplaced}개 배치 못했어요`);

  saveState(state);
  updateStats();
  renderContainerTabs();
  renderPartPicker();
  renderPlacedList();
  buildLayerToggles();
  applySliceAndLayer();
}