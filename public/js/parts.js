let state = loadState();

function render() {
  renderContainerSelector();
  renderPartsGrid();
  updateNavStats();
  updateActionBar();
}

function renderContainerSelector() {
  document.getElementById('contSelector').innerHTML =
    Object.entries(CONTAINERS).map(([key, c]) => `
      <div class="cont-card ${state.containerType === key ? 'active' : ''}"
           onclick="selectContainer('${key}')">
        <div class="cont-card-label">${c.label}</div>
        <div class="cont-card-spec">${c.spec} mm</div>
      </div>
    `).join('');
}

function selectContainer(type) {
  state.containerType = type;
  // 전역 userQty는 유지, 컨테이너 타입만 변경
  saveState(state);
  render();
}

function renderPartsGrid() {
  document.getElementById('partsGrid').innerHTML = PARTS_DEF.map(p => {
    const placed = getPlacedCount(p.code);
    const target = state.userQty?.[p.code] ?? 0;
    return `
      <div class="part-card" id="part-${p.code}">
        <style>#part-${p.code}::before { background: ${p.color}; }</style>
        <div class="part-card-top">
          <div>
            <div class="part-code-big" style="color:${p.code === p.code ? p.color : ''}">${p.code}</div>
            <div class="part-name-big">${p.name}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span class="badge badge-orange">${p.mat}</span>
            ${placed > 0 ? `<span class="badge badge-green">✓ ${placed}개 배치</span>` : ''}
          </div>
        </div>
        <div class="part-dims-row">
          <div>W <span>${p.w.toLocaleString()}</span></div>
          <div>H <span>${p.h.toLocaleString()}</span></div>
          <div>D <span>${p.d.toLocaleString()}</span></div>
          <div style="margin-left:auto">mm</div>
        </div>
        <div class="part-card-bottom">
          <div class="qty-ctrl">
            <button class="qty-btn" onclick="changeQty('${p.code}',-10)">−10</button>
            <button class="qty-btn" onclick="changeQty('${p.code}',-1)">−</button>
            <input class="qty-input" type="number" min="0" max="${MAX_QTY}"
              value="${target}"
              onchange="setQty('${p.code}', this.value)"
              onclick="event.stopPropagation()">
            <button class="qty-btn" onclick="changeQty('${p.code}',+1)">＋</button>
            <button class="qty-btn" onclick="changeQty('${p.code}',+10)">+10</button>
            <span class="qty-total">/ ${MAX_QTY}</span>
          </div>
        </div>
        <div class="part-progress-wrap" style="margin-top:10px">
          <div class="part-progress-bar" style="width:${target>0?Math.min(100,placed/target*100):0}%;background:${p.color}"></div>
        </div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:3px;text-align:right">
          <span style="color:${p.color}">${placed}</span> / ${target} 배치됨
        </div>
      </div>
    `;
  }).join('');
}

function changeQty(code, delta) {
  if (!state.userQty) state.userQty = {};
  state.userQty[code] = Math.max(0, Math.min(MAX_QTY, (state.userQty[code] ?? 0) + delta));
  saveState(state);
  render();
}

function setQty(code, val) {
  if (!state.userQty) state.userQty = {};
  state.userQty[code] = Math.max(0, Math.min(MAX_QTY, parseInt(val) || 0));
  saveState(state);
  render();
}

// 전체 컨테이너 합산 배치 수 반환
function getPlacedCount(code) {
  if (!state.containers) return 0;
  return state.containers.reduce((sum, ct) => {
    if (!ct.placedParts) return sum;
    return sum + ct.placedParts.filter(p => p.code === code).length;
  }, 0);
}

function updateNavStats() {
  const totalPlaced = state.containers
    ? state.containers.reduce((s, ct) => s + (ct.placedParts?.length ?? 0), 0)
    : 0;
  document.getElementById('navLoaded').textContent = totalPlaced;
  document.getElementById('navTotal').textContent  = PARTS_DEF.reduce((s, p) => s + (state.userQty?.[p.code] ?? 0), 0);
}

function updateActionBar() {
  const c = CONTAINERS[state.containerType];
  document.getElementById('totalParts').textContent = PARTS_DEF.length;
  document.getElementById('contLabel').textContent  = `${c.label} (${c.spec})`;
}

function handleReset() {
  if (!confirm('모든 배치 데이터를 초기화할까요?')) return;
  resetState();
  state = loadState();
  render();
}

render();
window.addEventListener('storage', () => { state = loadState(); render(); });