// pallet-logic.js — 팔레트/박스 추가·삭제·배치·자동적재 로직

function createBoxMesh(box, pallet) {
  const W = box.w, D = box.d, H = box.h;
  const color = new THREE.Color(box.color);

  const geo = new THREE.BoxGeometry(W, H, D);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type:'box', boxId:box.id, palletId:pallet.id, label:box.label, ww:W, dd:D, hh:H, weight:box.weight };

  const edges = new THREE.EdgesGeometry(geo);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
    color: new THREE.Color(box.color).offsetHSL(0, 0, 0.2),
    transparent: true, opacity: 0.5
  }));
  mesh.add(line);

  mesh.position.set(
    pallet.posX + box.posX,
    pallet.h + box.posY + H / 2,
    pallet.posZ + box.posZ
  );

  scene.add(mesh);
  box.mesh = mesh;
  return mesh;
}

function addPallet() {
  const name = document.getElementById('pallet-name').value || `P-${String(palletCounter).padStart(3,'0')}`;
  const w = parseInt(document.getElementById('pallet-w').value) || 1200;
  const d = parseInt(document.getElementById('pallet-d').value) || 1000;
  const h = parseInt(document.getElementById('pallet-h').value) || 150;
  const selfWeight = parseFloat(document.getElementById('pallet-self-weight').value) || 25;
  const maxLoad = parseFloat(document.getElementById('pallet-max-load').value) || 1500;
  const type = document.getElementById('pallet-type').value || 'flat';
  const wallH = parseInt(document.getElementById('pallet-wall-h').value) || 600;

  const idx = pallets.length;
  const cols = 3;
  const spacing = 1800;
  const posX = (idx % cols) * spacing - (cols - 1) * spacing / 2;
  const posZ = Math.floor(idx / cols) * spacing - 500;

  const pallet = {
    id: 'pallet_' + Date.now(),
    name,
    w, d, h, selfWeight, maxLoad,
    type, wallH,
    posX, posZ,
    boxes: [],
    mesh: null
  };

  pallets.push(pallet);
  createPalletMesh(pallet);
  selectPallet(pallet.id);

  palletCounter++;
  document.getElementById('pallet-name').value = `P-${String(palletCounter).padStart(3,'0')}`;

  updateUI();
}

function selectPallet(id) {
  selectedPalletId = id;
  highlightPallet(id);
  updatePalletList();
  updateSelectedInfo();
  updateBoxList();
}

// mesh + geometry + material 완전 제거 (GPU 메모리 즉시 해제)
function disposeMesh(obj) {
  if (!obj) return;
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
  });
  scene.remove(obj);
}

function removePallet(id) {
  const p = pallets.find(p => p.id === id);
  if (!p) return;
  disposeMesh(p.mesh);
  p.boxes.forEach(b => disposeMesh(b.mesh));
  pallets = pallets.filter(p => p.id !== id);
  if (selectedPalletId === id) selectedPalletId = pallets.length > 0 ? pallets[pallets.length-1].id : null;
  if (selectedPalletId) highlightPallet(selectedPalletId);
  updateUI();
}

function addBox() {
  if (!selectedPalletId) { alert('파렛트를 먼저 선택하세요!'); return; }
  const pallet = pallets.find(p => p.id === selectedPalletId);
  if (!pallet) return;

  const bw = parseInt(document.getElementById('box-w').value) || 400;
  const bd = parseInt(document.getElementById('box-d').value) || 300;
  const bh = parseInt(document.getElementById('box-h').value) || 300;
  const weight = parseFloat(document.getElementById('box-weight').value) || 20;

  const pos = findBoxPosition(pallet, bw, bd);
  const box = {
    id: 'box_' + Date.now(),
    label: `BOX-${String(boxCounter++).padStart(3,'0')}`,
    w: bw, d: bd, h: bh,
    weight, color: selectedColor,
    boxType: 'A',
    posX: pos.x, posY: pos.y, posZ: pos.z,
    mesh: null
  };
  pallet.boxes.push(box);
  createBoxMesh(box, pallet);
  updateUI();
}

function findBoxPosition(pallet, bw, bd) {
  // Simple grid packing
  const margin = 10;
  const maxW = pallet.w - margin * 2;
  const maxD = pallet.d - margin * 2;
  const startX = -pallet.w / 2 + margin + bw / 2;
  const startZ = -pallet.d / 2 + margin + bd / 2;

  const cols = Math.max(1, Math.floor(maxW / bw));
  const rows = Math.max(1, Math.floor(maxD / bd));
  const idx = pallet.boxes.length;
  const perLayer = cols * rows;
  const layer = Math.floor(idx / perLayer);
  const inLayer = idx % perLayer;
  const col = inLayer % cols;
  const row = Math.floor(inLayer / cols);

  // Calculate layer Y
  let layerY = 0;
  if (layer > 0) {
    const prevLayerBoxes = pallet.boxes.slice((layer - 1) * perLayer, layer * perLayer);
    const maxH = prevLayerBoxes.reduce((m, b) => Math.max(m, b.h), 0);
    layerY = prevLayerBoxes.length > 0 ? layer * maxH : 0;
  }

  return {
    x: startX + col * bw,
    y: layerY,
    z: startZ + row * bd
  };
}

function autoStack() {
  if (!selectedPalletId) { alert('파렛트를 먼저 선택하세요!'); return; }
  const pallet = pallets.find(p => p.id === selectedPalletId);
  if (!pallet || pallet.boxes.length === 0) return;

  // Re-sort and re-stack all boxes on pallet
  const boxes = [...pallet.boxes];
  boxes.sort((a, b) => (b.w * b.d) - (a.w * a.d)); // largest first

  // Remove existing meshes
  boxes.forEach(b => { disposeMesh(b.mesh); b.mesh = null; });
  pallet.boxes = [];

  // Re-add sorted
  boxes.forEach(box => {
    const pos = findBoxPosition(pallet, box.w, box.d);
    box.posX = pos.x; box.posY = pos.y; box.posZ = pos.z;
    pallet.boxes.push(box);
    createBoxMesh(box, pallet);
  });
  updateUI();
}

function clearBoxes() {
  if (!selectedPalletId) return;
  const pallet = pallets.find(p => p.id === selectedPalletId);
  if (!pallet) return;
  pallet.boxes.forEach(b => disposeMesh(b.mesh));
  pallet.boxes = [];
  updateUI();
}

function removeBox(boxId) {
  pallets.forEach(p => {
    const idx = p.boxes.findIndex(b => b.id === boxId);
    if (idx !== -1) {
      disposeMesh(p.boxes[idx].mesh);
      p.boxes.splice(idx, 1);
    }
  });
  updateUI();
}

function setView(mode) {
  document.querySelectorAll('.ctrl-btn').forEach(b => {
    if (b.id && b.id.startsWith('btn-')) b.classList.remove('active');
  });
  const btn = document.getElementById('btn-' + mode);
  if (btn) btn.classList.add('active');

  const r = spherical.radius;
  const cx = target.x, cy = target.y, cz = target.z;

  switch (mode) {
    case 'perspective':
      spherical.theta = Math.PI / 4;
      spherical.phi = Math.PI / 3;
      break;
    case 'top':
      spherical.theta = 0;
      spherical.phi = 0.01;
      break;
    case 'front':
      spherical.theta = 0;
      spherical.phi = Math.PI / 2;
      break;
    case 'side':
      spherical.theta = Math.PI / 2;
      spherical.phi = Math.PI / 2;
      break;
    case 'iso':
      spherical.theta = Math.PI / 4;
      spherical.phi = Math.PI / 4;
      break;
  }
  updateCamera();
}

function toggleGrid() {
  showGrid = !showGrid;
  gridHelper.visible = showGrid;
  const btn = document.getElementById('btn-grid');
  btn.classList.toggle('active', showGrid);
}


function toggleWallHeight() {
  const type = document.getElementById('pallet-type').value;
  const noWall = ['flat','karton'];
  document.getElementById('row-wall-h').style.display = noWall.includes(type) ? 'none' : '';
}

function onTypeChange() {
  const type = document.getElementById('pallet-type').value;
  const presets = {
    gamma2_mq4:   { w:1440, d:2270, h:150, wh:930 },
    meshpallet:  { w:1430, d:1090, h:150, wh:920 },
    karton:      { w:1433, d:1100, h:110, wh:0   },
    lotte_mesh:  { w:1443, d:1110, h:125, wh:897 },
    lotte_frame: { w:1440, d:1107, h:125, wh:897 },
    modeon:       { w:1430, d:1090, h:125, wh:620 },
    modeon_solid: { w:1430, d:1090, h:125, wh:620 },
    drum_h:       { w:1430, d:1090, h:300, wh:0   },
  };
  const p = presets[type];
  if (p) {
    document.getElementById('pallet-w').value = p.w;
    document.getElementById('pallet-d').value = p.d;
    document.getElementById('pallet-h').value = p.h;
    document.getElementById('pallet-wall-h').value = p.wh;
  }
  toggleWallHeight();
}

function selectColor(el) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  selectedColor = el.dataset.color;
}

function updatePalletList() {
  const list = document.getElementById('pallet-list');
  if (pallets.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-dim);text-align:center;padding:12px;">파렛트를 추가하세요</div>';
    return;
  }
  list.innerHTML = pallets.map(p => `
    <div class="pallet-item ${p.id === selectedPalletId ? 'active' : ''}" onclick="selectPallet('${p.id}')">
      <div class="pallet-dot"></div>
      <div class="pallet-label">
        <div style="font-size:13px;">${p.name}</div>
        <div style="font-size:11px;color:var(--text-dim);font-family:'Share Tech Mono',monospace;">${p.w}×${p.d}×${p.h} | ${{ flat:'평판', box:'박스', post:'포스트', sideboard:'사이드보드', octaframe:'옥타프레임', bulkbox:'벌크박스', meshpallet:'금호메시', karton:'금호카톤', lotte_mesh:'롯데메시', lotte_frame:'롯데프레임', modeon:'모드온메시', modeon_solid:'모드온솔리드', drum_h:'수평드럼', gamma2_mq4:'GAMMA2 MQ4' }[p.type]||'평판'} | ${p.boxes.length}박스</div>
      </div>
      <span class="pallet-remove" onclick="event.stopPropagation();removePallet('${p.id}')">✕</span>
    </div>
  `).join('');
}

function updateSelectedInfo() {
  const el = document.getElementById('selected-pallet-info');
  if (!selectedPalletId) {
    el.innerHTML = '<span style="color:var(--text-dim)">파렛트를 클릭하여 선택하세요</span>';
    return;
  }
  const p = pallets.find(p => p.id === selectedPalletId);
  if (!p) return;
  const totalBoxWeight = p.boxes.reduce((s, b) => s + b.weight, 0);
  const totalWeight = totalBoxWeight + p.selfWeight;
  const loadPct = Math.min(100, (totalBoxWeight / p.maxLoad * 100)).toFixed(1);
  const loadColor = loadPct > 90 ? 'var(--danger)' : loadPct > 70 ? 'var(--accent2)' : 'var(--success)';

  el.innerHTML = `
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <tr><td style="color:var(--text-dim);padding:3px 0;">이름</td><td style="font-family:'Share Tech Mono',monospace;color:var(--text)">${p.name}</td></tr>
      <tr><td style="color:var(--text-dim);padding:3px 0;">크기</td><td style="font-family:'Share Tech Mono',monospace;color:var(--text)">${p.w}×${p.d}×${p.h} mm</td></tr>
      <tr><td style="color:var(--text-dim);padding:3px 0;">자체하중</td><td style="font-family:'Share Tech Mono',monospace;color:var(--text)">${p.selfWeight} kg</td></tr>
      <tr><td style="color:var(--text-dim);padding:3px 0;">적재하중</td><td style="font-family:'Share Tech Mono',monospace;color:var(--accent2)">${totalBoxWeight.toFixed(1)} kg</td></tr>
      <tr><td style="color:var(--text-dim);padding:3px 0;">총중량</td><td style="font-family:'Share Tech Mono',monospace;color:var(--text)">${totalWeight.toFixed(1)} kg</td></tr>
      <tr><td style="color:var(--text-dim);padding:3px 0;">하중율</td><td style="font-family:'Share Tech Mono',monospace;color:${loadColor}">${loadPct}%</td></tr>
      <tr><td style="color:var(--text-dim);padding:3px 0;">박스수</td><td style="font-family:'Share Tech Mono',monospace;color:var(--text)">${p.boxes.length}</td></tr>
    </table>
  `;
}

function updateBoxList() {
  const el = document.getElementById('box-list');
  const p = pallets.find(p => p.id === selectedPalletId);
  if (!p || p.boxes.length === 0) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-dim);text-align:center;padding:12px;">박스가 없습니다</div>';
    return;
  }
  el.innerHTML = p.boxes.map(b => `
    <div class="box-item">
      <div class="box-color-dot" style="background:${b.color}"></div>
      <div class="box-info">
        <div class="box-info-main">${b.label}</div>
        <div class="box-info-sub">${b.w}×${b.d}×${b.h}mm · ${b.weight}kg</div>
      </div>
      <span class="box-remove" onclick="removeBox('${b.id}')">✕</span>
    </div>
  `).join('');
}

function updateStats() {
  const totalBoxes = pallets.reduce((s, p) => s + p.boxes.length, 0);
  const totalWeight = pallets.reduce((s, p) => s + p.selfWeight + p.boxes.reduce((bs, b) => bs + b.weight, 0), 0);

  const maxLoadPct = pallets.length > 0
    ? Math.max(...pallets.map(p => {
        const bw = p.boxes.reduce((s, b) => s + b.weight, 0);
        return (bw / p.maxLoad * 100);
      }))
    : 0;

  document.getElementById('stat-pallets').textContent = pallets.length;
  document.getElementById('stat-boxes').textContent = totalBoxes;
  document.getElementById('stat-weight').textContent = totalWeight.toFixed(1);

  // Stacking efficiency
  const pallet = pallets.find(p => p.id === selectedPalletId);
  let vol = 0;
  if (pallet && pallet.boxes.length > 0) {
    const palletVol = pallet.w * pallet.d * 1500;
    const boxVol = pallet.boxes.reduce((s, b) => s + b.w * b.d * b.h, 0);
    vol = Math.min(100, (boxVol / palletVol * 100)).toFixed(1);
  }
  document.getElementById('stat-volume').textContent = vol;

  // Header stats
  document.getElementById('hstat-pallets').textContent = pallets.length;
  document.getElementById('hstat-boxes').textContent = totalBoxes;
  document.getElementById('hstat-weight').textContent = totalWeight.toFixed(1) + ' kg';
  document.getElementById('hstat-max').textContent = Math.min(100, maxLoadPct).toFixed(1) + '%';

  // Weight bars per pallet
  const wbEl = document.getElementById('weight-bars');
  if (pallets.length === 0) { wbEl.innerHTML = ''; return; }
  wbEl.innerHTML = pallets.map(p => {
    const bw = p.boxes.reduce((s, b) => s + b.weight, 0);
    const pct = Math.min(100, (bw / p.maxLoad * 100));
    const barColor = pct > 90 ? '#ff4444' : pct > 70 ? '#ff6b35' : '#00d4ff';
    return `
      <div class="weight-bar-wrap">
        <div class="weight-bar-label">
          <span>${p.name}</span>
          <span style="font-family:'Share Tech Mono',monospace;color:${barColor}">${bw.toFixed(0)}/${p.maxLoad}kg (${pct.toFixed(0)}%)</span>
        </div>
        <div class="weight-bar-track">
          <div class="weight-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${barColor},${barColor}aa)"></div>
        </div>
      </div>
    `;
  }).join('');
}