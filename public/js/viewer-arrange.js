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
  const EPS2 = 1;
  return aabb.minX < -(c.iW/2 + EPS2) || aabb.maxX > (c.iW/2 + EPS2) ||
         aabb.minZ < -(c.iD/2 + EPS2) || aabb.maxZ > (c.iD/2 + EPS2) ||
         aabb.minY < -EPS2             || aabb.maxY > (c.iH   + EPS2);
}

// ─── 최대층 높이 계산 헬퍼 ────────────────────────────────────
// maxLayer > 0 이면 해당 부품은 dh * maxLayer 이상 올라갈 수 없음
// 반환값: 이 부품에 적용할 실효 최대 Y 상단값
function getLayerMaxY(code, dh, globalMaxH) {
  if (!state.userMaxLayer) return globalMaxH;
  const ml = state.userMaxLayer[code] ?? 0;
  if (ml <= 0) return globalMaxH;
  return Math.min(globalMaxH, dh * ml);
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

  ct.placedParts.forEach(pp => {
    if (meshMap[pp.id]) { scene.remove(meshMap[pp.id]); delete meshMap[pp.id]; }
  });
  const toRemove = [];
  scene.traverse(obj => {
    if (obj.userData?.id !== undefined && obj.userData?.contIdx === activeContIdx) toRemove.push(obj);
  });
  toRemove.forEach(obj => { if (obj.parent) obj.parent.remove(obj); });

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

  const ct = state.containers[idx];
  if (ct.userQty && Object.keys(ct.userQty).length > 0) {
    state.userQty = { ...ct.userQty };
  }
  PARTS_DEF.forEach(p => {
    if (!state.userQty) state.userQty = {};
    if (state.userQty[p.code] === undefined) state.userQty[p.code] = 0;
    if (!state.userOrient) state.userOrient = {};
    if (state.userOrient[p.code] === undefined) state.userOrient[p.code] = 'flat';
    if (!state.userMaxLayer) state.userMaxLayer = {};
    if (state.userMaxLayer[p.code] === undefined) state.userMaxLayer[p.code] = 0;
  });

  visibleCodes = null;
  sliceAxis = null;
  document.querySelectorAll('.slice-btn').forEach(b => b.classList.remove('active'));
  const sw = document.getElementById('sliceSliderWrap');
  if (sw) sw.style.display = 'none';
  buildAllContainers();
  rebuildMeshes();
  renderContainerTabs();
  renderPartPicker();
  renderPlacedList();
  updateHUD();
  buildLayerToggles();
  if (typeof rsDrawMinimap === 'function') rsDrawMinimap();
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

// ── 자동배치 ──────────────────────────────────────────────────
function autoArrange() {
  sliceAxis = null;
  visibleCodes = null;
  document.querySelectorAll('.slice-btn').forEach(b => b.classList.remove('active'));
  if (document.getElementById('sliceSliderWrap'))
    document.getElementById('sliceSliderWrap').style.display = 'none';

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

  const userQty      = state.userQty      ?? {};
  const userOrient   = state.userOrient   ?? {};
  const userMaxLayer = state.userMaxLayer ?? {};

  // ── 1. 아이템 목록 생성 & 정렬 ──────────────────────────────
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

  // ── 2. HeightMap ──────────────────────────────────────────
  const STEP = 10;
  const nx = Math.ceil(c.iW / STEP) + 1;
  const nz = Math.ceil(c.iD / STEP) + 1;
  const hmap = new Float32Array(nx * nz);
  const xOrig = -c.iW / 2;
  const zOrig = -c.iD / 2;

  function hmIdx(ix, iz) { return ix * nz + iz; }

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

  function hmSetFloor(minX, maxX, minZ, maxZ, topY) {
    const ix0 = Math.max(0, Math.floor((minX - xOrig) / STEP));
    const ix1 = Math.min(nx - 1, Math.ceil((maxX - xOrig) / STEP));
    const iz0 = Math.max(0, Math.floor((minZ - zOrig) / STEP));
    const iz1 = Math.min(nz - 1, Math.ceil((maxZ - zOrig) / STEP));
    for (let ix = ix0; ix <= ix1; ix++)
      for (let iz = iz0; iz <= iz1; iz++)
        if (topY > hmap[hmIdx(ix, iz)]) hmap[hmIdx(ix, iz)] = topY;
  }

  // ── 3. 메인 배치 루프 ────────────────────────────────────────
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

      // ── 최대 층수 적용 ────────────────────────────────────
      // layerMaxY: 이 부품의 상단(Y)이 넘어서는 안 되는 높이
      const layerMaxY = getLayerMaxY(p.code, dh, maxH);

      // STEP 간격으로 전체 바닥면 스캔 → 빈틈 없이 채움
      const SCAN = 50; // mm 단위 스캔 해상도
      const candidates = [];
      for (let lx = -c.iW/2 + dw/2; lx + dw/2 <= c.iW/2 + 0.5; lx += SCAN) {
        for (let lz = -c.iD/2 + dd/2; lz + dd/2 <= c.iD/2 + 0.5; lz += SCAN) {
          const floor = hmGetFloor(lx - dw/2, lx + dw/2, lz - dd/2, lz + dd/2);
          if (floor + dh > layerMaxY + 0.5) continue;
          candidates.push({ lx, lz, floor, ly: floor + dh/2 });
        }
      }
      // Z(깊이/안쪽) 방향 먼저 채우고 → X열로 이동
      // 같은 X·Z 위치에서는 floor 낮은 순(쌓기)
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
        if (aabb.maxY > layerMaxY + 0.5) continue;

        const collision = ct.placedParts.some(pp => {
          const bb = getAABB(pp);
          return bb && overlaps(aabb, bb);
        });
        if (collision) continue;

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

    if (!placed) unplaced++;
  });

  if (unplaced > 0) showToast(`⚠️ 공간 부족 또는 층 제한으로 ${unplaced}개 배치 못했어요`);

  saveState(state);
  updateStats();
  renderContainerTabs();
  renderPartPicker();
  renderPlacedList();
  buildLayerToggles();
  applySliceAndLayer();
}