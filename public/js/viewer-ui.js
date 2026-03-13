// viewer-ui.js — UI 렌더링, HUD, 이벤트, 카메라

// ─── UI ───────────────────────────────────────────────────────
window._partOpen = {};

function togglePartAccordion(code, e) {
  e.stopPropagation();
  window._partOpen[code] = !window._partOpen[code];
  renderPartPicker();
}

function renderPartPicker() {
  const activeCt = state.containers[activeContIdx];
  const uQty      = state.userQty      ?? activeCt?.userQty      ?? {};
  const uOrient   = state.userOrient   ?? activeCt?.userOrient   ?? {};
  const uMaxLayer = state.userMaxLayer ?? {};

  const html = PARTS_DEF.map(p => {
    const placed = activeCt.placedParts.filter(pp => pp.code === p.code).length;
    const target = uQty[p.code] ?? 0;
    const full   = placed >= target && target > 0;
    const open   = !!window._partOpen[p.code];
    const orient = uOrient[p.code] || 'flat';
    const dims   = getOrientedDims(p, orient);
    const barPct = target > 0 ? Math.min(100, placed / target * 100) : 0;
    const color  = getPartColor(p.code);
    const sets   = p.setQty && target > 0 ? Math.round(target / p.setQty) : 0;
    const maxLayer = uMaxLayer[p.code] ?? 0; // 0 = 무제한

    // 층수 선택 옵션: 0(무제한), 1~10층
    const layerOptions = [0,1,2,3,4,5,6,7,8,9,10].map(n =>
      `<option value="${n}" ${maxLayer===n?'selected':''}>${n===0?'무제한':n+'층'}</option>`
    ).join('');

    return `
    <div class="part-item ${full?'full':''}">

      <!-- ── 헤더 (항상 보임) ── -->
      <div class="part-acc-header" onclick="togglePartAccordion('${p.code}',event)">
        <input type="color" value="${color}"
          title="색상 변경"
          style="width:14px;height:14px;border:none;background:none;cursor:pointer;padding:0;border-radius:2px;flex-shrink:0"
          onclick="event.stopPropagation()"
          oninput="event.stopPropagation();setPartColor('${p.code}',this.value)">
        <span style="color:${color};font-family:var(--font-mono);font-size:12px;font-weight:800;flex-shrink:0;width:20px">${p.code}</span>
        <span style="font-size:10px;color:var(--text-dim);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</span>
        ${maxLayer > 0 ? `<span title="최대 ${maxLayer}층" style="font-family:var(--font-mono);font-size:8px;background:rgba(251,146,60,.18);color:#fb923c;border:1px solid rgba(251,146,60,.35);border-radius:3px;padding:1px 5px;flex-shrink:0;margin-right:2px">${maxLayer}층↑</span>` : ''}
        <span style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:${full?'#22d37f':placed>0?color:'var(--text-dim)'}">
          ${placed}<span style="color:var(--text-dim);font-weight:400;font-size:9px">/${target}</span>
        </span>
        <span style="color:var(--text-dim);font-size:10px;margin-left:4px;display:inline-block;transition:transform .2s;transform:rotate(${open?'180':'0'}deg)">▾</span>
      </div>

      <!-- 진행 바 -->
      <div style="height:2px;background:#151820">
        <div style="height:100%;width:${barPct}%;background:${color};transition:width .3s"></div>
      </div>

      <!-- ── 펼침 바디 ── -->
      ${open ? `
      <div class="part-acc-body" onclick="selectPart('${p.code}')">

        <!-- 방향 -->
        <div class="part-orient-row" onclick="event.stopPropagation()">
          <span class="qty-label">방향</span>
          ${Object.entries(ORIENTATIONS).map(([key, o]) => `
            <button class="orient-btn ${orient===key?'active':''}"
              onclick="setOrient('${p.code}','${key}')">
              ${o.icon} ${o.label}
            </button>
          `).join('')}
        </div>
        <div style="font-family:var(--font-mono);font-size:8.5px;color:#4a6080;margin-top:3px;text-align:right">
          ${dims.w} × ${dims.h} × ${dims.d} mm
        </div>

        <!-- 수량 -->
        <div class="part-qty-row" onclick="event.stopPropagation()">
          <span class="qty-label">수량</span>
          <button class="qty-btn" onclick="changeUserQty('${p.code}',-10)">−10</button>
          <button class="qty-btn" onclick="changeUserQty('${p.code}',-1)">−</button>
          <input class="qty-input" type="number" min="0" max="${MAX_QTY}"
            value="${target}"
            onchange="setUserQty('${p.code}',this.value)"
            onclick="event.stopPropagation()">
          <button class="qty-btn" onclick="changeUserQty('${p.code}',+1)">＋</button>
          <button class="qty-btn" onclick="changeUserQty('${p.code}',+10)">+10</button>
        </div>

        <!-- 세트 (setQty 있는 부품만) -->
        ${p.setQty ? `
        <div class="part-qty-row" style="margin-top:3px;background:rgba(56,189,248,.04);border-radius:4px;padding:3px 4px" onclick="event.stopPropagation()">
          <span class="qty-label">세트</span>
          <button class="qty-btn" onclick="changeUserQtyBySet('${p.code}',-1)">−1세트</button>
          <input class="qty-input" type="number" min="0"
            value="${sets}"
            style="width:36px"
            onchange="setUserQtyBySets('${p.code}',this.value)"
            onclick="event.stopPropagation()">
          <button class="qty-btn" onclick="changeUserQtyBySet('${p.code}',+1)">+1세트</button>
          <span style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-left:2px">(1세트=${p.setQty}개)</span>
        </div>` : ''}

        <!-- ── 최대 적재 층 ── -->
        <div class="part-qty-row" style="margin-top:6px;padding-top:6px;border-top:1px solid #1a2030" onclick="event.stopPropagation()">
          <span class="qty-label" style="min-width:44px">최대층</span>
          <div style="display:flex;align-items:center;gap:4px;flex:1">
            <button class="qty-btn" onclick="changeMaxLayer('${p.code}',-1)"
              style="${maxLayer===0?'opacity:.35;pointer-events:none':''}">−</button>
            <select
              onchange="setMaxLayer('${p.code}',this.value)"
              onclick="event.stopPropagation()"
              style="flex:1;background:var(--surface);border:1px solid var(--border);color:${maxLayer>0?'#fb923c':'var(--text-dim)'};border-radius:3px;font-family:var(--font-mono);font-size:11px;font-weight:${maxLayer>0?'700':'400'};padding:2px 4px;outline:none;cursor:pointer">
              ${layerOptions}
            </select>
            <button class="qty-btn" onclick="changeMaxLayer('${p.code}',+1)"
              style="${maxLayer>=10?'opacity:.35;pointer-events:none':''}">＋</button>
          </div>
          ${maxLayer > 0 ? `
          <button onclick="setMaxLayer('${p.code}',0);event.stopPropagation()"
            style="background:none;border:none;color:var(--text-dim);font-size:9px;cursor:pointer;padding:0 2px;font-family:var(--font-mono);text-decoration:underline;flex-shrink:0"
            title="층 제한 해제">해제</button>` : ''}
        </div>
        ${maxLayer > 0 ? `
        <div style="font-family:var(--font-mono);font-size:8px;color:#fb923c;margin-top:3px;text-align:right;opacity:.8">
          자동배치 시 최대 ${maxLayer}층까지만 쌓아요
        </div>` : ''}

        <!-- 배치 상태 -->
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:5px;display:flex;justify-content:space-between;align-items:center">
          <span><span style="color:${color};font-weight:700">${placed}</span> / ${target} 배치됨</span>
        </div>
      </div>
      ` : ''}
    </div>`;
  }).join('');

  const picker = document.getElementById('partPicker');
  if (picker) picker.innerHTML = html;
}

// ─── 최대 층수 제어 ──────────────────────────────────────────
function setMaxLayer(code, val) {
  if (!state.userMaxLayer) state.userMaxLayer = {};
  state.userMaxLayer[code] = Math.max(0, Math.min(10, parseInt(val) || 0));
  saveState(state);
  renderPartPicker();
}

function changeMaxLayer(code, delta) {
  if (!state.userMaxLayer) state.userMaxLayer = {};
  const cur = state.userMaxLayer[code] ?? 0;
  setMaxLayer(code, cur + delta);
}

// 적재 목록 컨테이너별 열림 상태
if (!window._listOpen) window._listOpen = {};

function toggleListGroup(idx) {
  window._listOpen[idx] = !window._listOpen[idx];
  renderPlacedList();
}

function renderPlacedList() {
  const el = document.getElementById('placedList');
  const totalPlaced = state.containers.reduce((s, ct) => s + ct.placedParts.length, 0);

  const hdrEl = document.getElementById('placedListHeader');
  if (hdrEl) hdrEl.textContent = '적재 목록 (' + totalPlaced + '개)';

  if (!totalPlaced) {
    el.innerHTML = '<div style="color:var(--text-dim);font-size:10px;padding:14px;text-align:center;line-height:1.8">부품 선택 후<br>뷰포트 클릭으로 배치</div>';
    return;
  }

  el.innerHTML = state.containers.map((ct, idx) => {
    if (!ct.placedParts.length) return '';
    const open = !!window._listOpen[idx];
    return `
      <div class="placed-group-header" onclick="toggleListGroup(${idx})">
        <span style="font-family:var(--font-mono);font-weight:700;color:var(--accent)">#${idx+1} 컨테이너</span>
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-left:6px">${ct.placedParts.length}개</span>
        <span style="margin-left:auto;font-size:9px;color:var(--text-dim);transition:transform .2s;display:inline-block;transform:rotate(${open?'0':'180'}deg)">▲</span>
      </div>
      ${open ? [...ct.placedParts].reverse().map(pp => {
        const p = PARTS_DEF.find(x => x.code === pp.code);
        return `
          <div class="placed-item">
            <div class="placed-dot" style="background:${p.color}"></div>
            <div class="placed-info">
              <div class="placed-name">${pp.code} ${p.name}</div>
              <div class="placed-pos">${Math.round(pp.x)}, ${Math.round(pp.y)}, ${Math.round(pp.z)}</div>
            </div>
            <button class="rm-btn" onclick="removePart(${pp.id})">×</button>
          </div>
        `;
      }).join('') : ''}
    `;
  }).join('');
}

function updateHUD() {
  const ct = state.containers[activeContIdx];
  document.getElementById('hudCont').textContent = '#' + (activeContIdx+1) + ' ' + state.containerType;
  document.getElementById('hudCount').textContent = ct ? ct.placedParts.length : 0;
  document.getElementById('navCont').textContent = state.containers.length + '개';
}

// ─── FILL HEIGHT 제어 ────────────────────────────────────────
function setContSpacing(val) {
  CONT_SPACING = Math.max(0, Math.min(3000, parseInt(val) || 0));
  const slider = document.getElementById('contSpacingSlider');
  const label  = document.getElementById('contSpacingLabel');
  if (slider) slider.value = CONT_SPACING;
  if (label)  label.textContent = CONT_SPACING + ' mm';
  buildAllContainers();
  rebuildMeshes();
}

function changeContSpacing(delta) {
  setContSpacing(CONT_SPACING + delta);
}

function setFillHeight(val) {
  const c = CONTAINERS[state.containerType];
  fillHeight = Math.max(100, Math.min(c.iH, parseInt(val) || 2100));
  const inp    = document.getElementById('fillHeightInput');
  const slider = document.getElementById('fillHeightSlider');
  const pct    = document.getElementById('fillHeightPct');
  if (inp)    inp.value    = fillHeight;
  if (slider) slider.value = fillHeight;
  if (pct)    pct.textContent = Math.round(fillHeight / c.iH * 100) + '%';
  _updateFillHeightBar();
}

function changeFillHeight(delta) {
  const c = CONTAINERS[state.containerType];
  fillHeight = Math.max(100, Math.min(c.iH, fillHeight + delta));
  const inp = document.getElementById('fillHeightInput');
  if (inp) inp.value = fillHeight;
  _updateFillHeightBar();
}

function _updateFillHeightBar() {
  const c = CONTAINERS[state.containerType];
  const pct = Math.round(fillHeight / c.iH * 100);
  const bar = document.getElementById('fillHeightBar');
  const lim = document.getElementById('fillHeightLimit');
  const lbl = document.getElementById('fillHeightPct');
  if (bar) bar.style.height = pct + '%';
  if (lim) lim.style.bottom = pct + '%';
  if (lbl) lbl.textContent = pct + '%';
}

function updateStats() {
  const c = CONTAINERS[state.containerType];
  const vol = c.iW * c.iH * c.iD * state.containers.length;
  const used = state.containers.reduce((total, ct) =>
    total + ct.placedParts.reduce((s, pp) => {
      const p = PARTS_DEF.find(x => x.code === pp.code);
      return p ? s + p.w * p.h * p.d : s;
    }, 0), 0);
  const pct = Math.min(100, used / vol * 100);
  document.getElementById('loadPct').textContent  = pct.toFixed(1);
  document.getElementById('loadBar').style.width  = pct + '%';
  document.getElementById('hudCount').textContent = state.containers[activeContIdx]?.placedParts.length ?? 0;
  document.getElementById('navUtil').textContent  = pct.toFixed(1);
  renderContainerTabs();
}

function setOrient(code, orient) {
  if (!state.userOrient) state.userOrient = {};
  state.userOrient[code] = orient;
  saveState(state);
  renderPartPicker();
}

function changeUserQtyBySet(code, setDelta) {
  const p = PARTS_DEF.find(x => x.code === code);
  if (!p || !p.setQty) return;
  if (!state.userQty) state.userQty = {};
  const cur = state.userQty[code] ?? 0;
  state.userQty[code] = Math.max(0, Math.min(MAX_QTY, cur + setDelta * p.setQty));
  saveState(state); renderPartPicker();
}

function setUserQtyBySets(code, sets) {
  const p = PARTS_DEF.find(x => x.code === code);
  if (!p || !p.setQty) return;
  if (!state.userQty) state.userQty = {};
  state.userQty[code] = Math.max(0, Math.min(MAX_QTY, (parseInt(sets) || 0) * p.setQty));
  saveState(state); renderPartPicker();
}

// ══════════════════════════════════════════════════════════════
// 적재 최적화 분석 UI
// ══════════════════════════════════════════════════════════════
function changeUserQty(code, delta) {
  if (!state.userQty) state.userQty = {};
  state.userQty[code] = Math.max(0, Math.min(MAX_QTY, (state.userQty[code] ?? 0) + delta));
  saveState(state); renderPartPicker();
}
function setUserQty(code, val) {
  if (!state.userQty) state.userQty = {};
  state.userQty[code] = Math.max(0, Math.min(MAX_QTY, parseInt(val) || 0));
  saveState(state); renderPartPicker();
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(239,68,68,.9);color:#fff;padding:8px 20px;border-radius:20px;font-size:12px;font-family:var(--font-sans);z-index:999;pointer-events:none;transition:opacity .3s;';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._to); t._to = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

// ─── CAMERA ───────────────────────────────────────────────────
function setView(v) {
  const c = CONTAINERS[state.containerType];
  const count = state.containers.length;
  const totalW = (count - 1) * (c.iW + CONT_SPACING);
  camTarget = { x: totalW / 2, y: c.iH / 2, z: 0 };
  const base = Math.max(20000, totalW * 0.8 + 20000);
  const views = {
    front: [0,         Math.PI/2.05, base],
    top:   [0,         0.05,         base * 1.2],
    side:  [Math.PI/2, Math.PI/2.05, base * 0.7],
    iso:   [Math.PI/4, Math.PI/3.5,  base],
  };
  [camTheta, camPhi, camRadius] = views[v] || views.iso;
  updateCamera();
}

// ─── EVENTS ───────────────────────────────────────────────────
function doRaycastHighlight(clientX, clientY, canvas) {
  const rect = canvas.getBoundingClientRect();
  mouse.x =  ((clientX - rect.left) / rect.width)  * 2 - 1;
  mouse.y = -((clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const groups = Object.values(meshMap).filter(Boolean);
  const hits = raycaster.intersectObjects(groups, true);
  if (!hits.length) { clearHighlight(); return; }

  let obj = hits[0].object;
  let id = obj.userData.id;
  while (id === undefined && obj.parent) {
    obj = obj.parent;
    id = obj.userData.id;
  }
  if (id !== undefined) setHighlight(id);
}

function setHighlight(id) {
  if (highlightedId !== null && meshMap[highlightedId]) {
    restoreMeshColor(highlightedId);
  }
  highlightedId = id;
  const group = meshMap[id];
  if (!group) return;

  group.traverse(child => {
    if (child.isMesh && child.material) {
      child.userData._origEmissive = child.material.emissive?.getHex() ?? 0;
      child.material.emissive = new THREE.Color(0xffffff);
      child.material.emissiveIntensity = 0.28;
    }
  });

  showInfoPopup(id);
}

function clearHighlight() {
  if (highlightedId !== null && meshMap[highlightedId]) {
    restoreMeshColor(highlightedId);
  }
  highlightedId = null;
  hideInfoPopup();
}

function restoreMeshColor(id) {
  const group = meshMap[id];
  if (!group) return;
  group.traverse(child => {
    if (child.isMesh && child.material) {
      child.material.emissive = new THREE.Color(child.userData._origEmissive ?? 0x000000);
      child.material.emissiveIntensity = 0;
    }
  });
}

function showInfoPopup(id) {
  let pp = null, contIdx = -1;
  state.containers.forEach((ct, ci) => {
    const found = ct.placedParts.find(p => p.id === id);
    if (found) { pp = found; contIdx = ci; }
  });
  if (!pp) return;

  const p = PARTS_DEF.find(x => x.code === pp.code);
  const dims = getOrientedDims(p, pp.orient || 'flat');
  const layerNum = Math.round((pp.y + dims.h/2) / dims.h);

  let popup = document.getElementById('infoPopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'infoPopup';
    popup.style.cssText = `
      position:absolute; top:12px; left:50%; transform:translateX(-50%);
      background:rgba(10,14,20,0.92); border:1px solid var(--accent);
      border-radius:8px; padding:12px 18px; font-family:var(--font-mono);
      font-size:11px; color:var(--text); backdrop-filter:blur(10px);
      pointer-events:none; z-index:100; min-width:220px;
      box-shadow:0 4px 24px rgba(0,0,0,0.5);
      animation: fadeIn .15s ease;
    `;
    document.querySelector('.viewport-wrap').appendChild(popup);
  }

  const maxLayer = state.userMaxLayer?.[p.code] ?? 0;
  const layerLimitStr = maxLayer > 0
    ? `<span style="color:#fb923c"> / 최대${maxLayer}층</span>`
    : '';

  popup.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="width:10px;height:10px;border-radius:2px;background:${p.color};flex-shrink:0"></div>
      <span style="font-size:13px;font-weight:700;color:var(--accent)">${p.code} ${p.name}</span>
    </div>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 12px;color:var(--text-dim)">
      <span>원본 치수</span><span style="color:var(--text)">${p.w} × ${p.h} × ${p.d} mm</span>
      <span>배치 치수</span><span style="color:var(--text)">${dims.w} × ${dims.h} × ${dims.d} mm</span>
      <span>방향</span><span style="color:var(--text)">${ORIENTATIONS[pp.orient]?.label || pp.orient}</span>
      <span>위치</span>
      <span style="color:var(--text);font-family:var(--font-mono);display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
        <span><span style="color:var(--accent);font-size:9px">X </span>${Math.round(pp.x)}</span>
        <span><span style="color:#4ade80;font-size:9px">Y </span>${Math.round(pp.y)}</span>
        <span><span style="color:#f59e0b;font-size:9px">Z </span>${Math.round(pp.z)}</span>
      </span>
      <span>층</span><span style="color:var(--accent)">${layerNum}층${layerLimitStr}</span>
      <span>컨테이너</span><span style="color:var(--green)">#${contIdx+1}</span>
      <span>재질</span><span style="color:var(--text)">${p.mat}</span>
    </div>
  `;
  popup.style.display = 'block';
}

function hideInfoPopup() {
  const popup = document.getElementById('infoPopup');
  if (popup) popup.style.display = 'none';
}

// ─── SLICE & LAYER ────────────────────────────────────────────
function applySliceAndLayer() {
  state.containers.forEach((ct) => {
    ct.placedParts.forEach(pp => {
      const mesh = meshMap[pp.id];
      if (!mesh) return;

      if (!sliceAxis && visibleCodes === null) {
        mesh.visible = true;
        return;
      }

      let show = true;

      if (visibleCodes !== null && !visibleCodes.has(pp.code)) show = false;

      if (show && sliceAxis) {
        const pos = sliceAxis === 'x' ? pp.x : sliceAxis === 'y' ? pp.y : pp.z;
        if (pos > sliceValue) show = false;
      }

      mesh.visible = show;
    });
  });
}

function setSlice(axis) {
  if (sliceAxis === axis) {
    sliceAxis = null;
    document.querySelectorAll('.slice-btn').forEach(b => b.classList.remove('active'));
    Object.values(meshMap).forEach(m => { if (m) m.visible = true; });
    visibleCodes = null;
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.add('active'));
  } else {
    sliceAxis = axis;
    const c = CONTAINERS[state.containerType];
    if (axis === 'x') sliceValue = 0;
    else if (axis === 'y') sliceValue = c.iH / 2;
    else sliceValue = 0;
    document.querySelectorAll('.slice-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.slice-btn[data-axis="${axis}"]`)?.classList.add('active');
  }
  updateSliceSlider();
  applySliceAndLayer();
}

function updateSliceSlider() {
  const wrap = document.getElementById('sliceSliderWrap');
  if (!wrap) return;
  if (!sliceAxis) { wrap.style.display = 'none'; return; }
  const c = CONTAINERS[state.containerType];
  let min, max;
  if (sliceAxis === 'x') { min = -c.iW/2; max = c.iW/2; }
  else if (sliceAxis === 'y') { min = 0; max = c.iH; }
  else { min = -c.iD/2; max = c.iD/2; }
  wrap.style.display = 'flex';
  const slider = document.getElementById('sliceSlider');
  slider.min = min; slider.max = max;
  slider.step = Math.round((max - min) / 100);
  slider.value = sliceValue;
  document.getElementById('sliceVal').textContent = Math.round(sliceValue) + ' mm';
}

function onSliceSlider(val) {
  sliceValue = parseFloat(val);
  document.getElementById('sliceVal').textContent = Math.round(sliceValue) + ' mm';
  applySliceAndLayer();
}

function buildLayerToggles() {
  const ct = state.containers[activeContIdx];
  const wrap = document.getElementById('layerToggles');
  if (!wrap) return;

  if (!ct.placedParts.length) {
    wrap.innerHTML = '<span style="color:var(--text-dim);font-size:9px">자동배치 후 활성화</span>';
    return;
  }

  const usedCodes = [...new Set(ct.placedParts.map(pp => pp.code))].sort();

  wrap.innerHTML = usedCodes.map(code => {
    const p = PARTS_DEF.find(x => x.code === code);
    return `
      <button class="layer-btn active" data-code="${code}" onclick="toggleCode('${code}', this)"
        style="border-left:3px solid ${p.color}; padding-left:6px">
        ${code}
      </button>`;
  }).join('');
}

function toggleCode(code, btn) {
  if (visibleCodes === null) {
    const ct = state.containers[activeContIdx];
    visibleCodes = new Set(ct.placedParts.map(pp => pp.code));
  }
  if (visibleCodes.has(code)) {
    visibleCodes.delete(code);
    btn.classList.remove('active');
  } else {
    visibleCodes.add(code);
    btn.classList.add('active');
  }
  applySliceAndLayer();
}

function resetLayers() {
  visibleCodes = null;
  sliceAxis = null;
  document.querySelectorAll('.layer-btn').forEach(b => b.classList.add('active'));
  document.querySelectorAll('.slice-btn').forEach(b => b.classList.remove('active'));
  if (document.getElementById('sliceSliderWrap'))
    document.getElementById('sliceSliderWrap').style.display = 'none';
  Object.values(meshMap).forEach(m => { if (m) m.visible = true; });
}


function setupEvents(canvas) {
  canvas.addEventListener('mousedown', e => {
    orbit.active = true; orbit.right = e.button === 2;
    orbit.lx = e.clientX; orbit.ly = e.clientY;
    orbit.moved = false;
  });
  window.addEventListener('mouseup', () => { orbit.active = false; });
  window.addEventListener('mousemove', e => {
    if (!orbit.active) return;
    const dx = e.clientX - orbit.lx, dy = e.clientY - orbit.ly;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) orbit.moved = true;
    orbit.lx = e.clientX; orbit.ly = e.clientY;
    if (orbit.right) {
      const right = new THREE.Vector3(-Math.cos(camTheta), 0, Math.sin(camTheta));
      camTarget.x += right.x * dx * 10;
      camTarget.z += right.z * dx * 10;
      camTarget.y += dy * 10;
    } else {
      camTheta -= dx * 0.005;
      camPhi = Math.max(0.05, Math.min(Math.PI * 0.48, camPhi - dy * 0.005));
    }
    updateCamera();
  });
  canvas.addEventListener('wheel', e => {
    camRadius = Math.max(2000, Math.min(200000, camRadius + e.deltaY * 20));
    updateCamera(); e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('click', e => {
    if (orbit.moved) return;
    doRaycastHighlight(e.clientX, e.clientY, canvas);
  });

  let touch = { active: false, pinch: false, lx: 0, ly: 0, dist: 0, moved: false };

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length === 1) {
      touch.active = true; touch.pinch = false; touch.moved = false;
      touch.lx = e.touches[0].clientX;
      touch.ly = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      touch.pinch = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touch.dist = Math.hypot(dx, dy);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 2 && touch.pinch) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const delta = touch.dist - newDist;
      camRadius = Math.max(2000, Math.min(200000, camRadius + delta * 80));
      touch.dist = newDist;
      updateCamera();
    } else if (e.touches.length === 1 && touch.active) {
      const dx = e.touches[0].clientX - touch.lx;
      const dy = e.touches[0].clientY - touch.ly;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) touch.moved = true;
      touch.lx = e.touches[0].clientX;
      touch.ly = e.touches[0].clientY;
      camTheta -= dx * 0.006;
      camPhi = Math.max(0.05, Math.min(Math.PI * 0.48, camPhi - dy * 0.006));
      updateCamera();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    if (!touch.moved && !touch.pinch && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      doRaycastHighlight(t.clientX, t.clientY, canvas);
    }
    if (e.touches.length === 0) { touch.active = false; touch.pinch = false; }
  }, { passive: false });
}