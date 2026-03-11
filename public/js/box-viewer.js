// ─── BOX VIEWER — 박스 적재 시뮬레이터 ──────────────────────────
// Three.js r128

const BOX_STATE_KEY = 'box_sim_v1';
const CONT_SPACING = 500;
const EPS = 0.5;

let boxState = loadBoxState();
let activeContIdx = 0;
let selectedBoxId = null;
let sliceAxis = null;
let sliceValue = 0;
let highlightedId = null;

function defaultBoxContState() { return { placedBoxes: [] }; }
function defaultBoxState() {
  return { containerType: 'ST', containers: [defaultBoxContState()], boxTypes: [] };
}
function loadBoxState() {
  try { const raw = localStorage.getItem(BOX_STATE_KEY); if (!raw) return defaultBoxState(); return JSON.parse(raw); }
  catch { return defaultBoxState(); }
}
function saveBoxState() { localStorage.setItem(BOX_STATE_KEY, JSON.stringify(boxState)); }

// ── THREE.JS ──────────────────────────────────────────────────
let scene, camera, renderer, raycaster, mouse;
let camTheta = Math.PI / 4, camPhi = Math.PI / 3.5, camRadius = 40000;
let camTarget = { x: 0, y: 1140, z: 0 };
let orbit = { active: false, right: false, lx: 0, ly: 0, moved: false };
let meshMap = {};
let containerObjects = [];

function contOffsetX(idx) {
  const c = CONTAINERS[boxState.containerType];
  return idx * (c.iW + CONT_SPACING);
}

// ── DISPOSE HELPER — GPU 메모리 즉시 해제 ────────────────────
function disposeMesh(mesh) {
  if (!mesh) return;
  scene.remove(mesh);
  mesh.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
  });
}

function initThree() {
  const canvas = document.getElementById('canvas3d');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  const vp0 = canvas.parentElement;
  renderer.setSize(vp0.clientWidth, vp0.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x1a1e26);

  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputEncoding = THREE.sRGBEncoding;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1e26);

  const vp = canvas.parentElement;
  camera = new THREE.PerspectiveCamera(45, vp.clientWidth / vp.clientHeight, 10, 500000);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(10000, 18000, 10000);
  dir.castShadow = true;
  dir.shadow.mapSize.set(4096, 4096);
  dir.shadow.camera.left = dir.shadow.camera.bottom = -60000;
  dir.shadow.camera.right = dir.shadow.camera.top = 60000;
  dir.shadow.camera.far = 120000;
  dir.shadow.bias = -0.0001;
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xc0d8ff, 0.7);
  fill.position.set(-8000, 6000, -6000); scene.add(fill);
  const bounce = new THREE.DirectionalLight(0xffffff, 0.3);
  bounce.position.set(0, -5000, 0); scene.add(bounce);

  const grid = new THREE.GridHelper(100000, 80, 0x2a2f3d, 0x232838);
  grid.position.y = -2; scene.add(grid);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  buildAllContainers();
  rebuildMeshes();
  setupEvents(canvas);
  animate();
}

function buildAllContainers() {
  containerObjects.forEach(o => { if (o.group) scene.remove(o.group); });
  containerObjects = [];
  const c = CONTAINERS[boxState.containerType];
  boxState.containers.forEach((_, idx) => {
    const ox = contOffsetX(idx);
    const isActive = idx === activeContIdx;
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(c.iW, c.iH, c.iD)),
      new THREE.LineBasicMaterial({ color: isActive ? 0x38bdf8 : 0x2a3050, opacity: isActive ? 0.8 : 0.5, transparent: true })
    );
    wire.position.set(ox, c.iH / 2, 0);
    scene.add(wire);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(c.iW, c.iD),
      new THREE.MeshStandardMaterial({ color: 0x1a2035, roughness: 0.9, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ox, 0, 0);
    floor.receiveShadow = true;
    scene.add(floor);
    containerObjects.push({ wire, floor });
  });
}

function rebuildMeshes() {
  Object.values(meshMap).forEach(m => disposeMesh(m));
  meshMap = {};
  boxState.containers.forEach((ct, ci) => {
    const ox = contOffsetX(ci);
    ct.placedBoxes.forEach(pb => {
      const mesh = makeMesh(pb, ox);
      scene.add(mesh);
      meshMap[pb.id] = mesh;
    });
  });
  updateStats();
}

function makeMesh(pb, ox) {
  const bt = boxState.boxTypes.find(b => b.id === pb.typeId);
  if (!bt) return new THREE.Group();
  const color = parseInt(bt.color.replace('#', ''), 16);
  const geo = new THREE.BoxGeometry(bt.w, bt.h, bt.d);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
  );
  mesh.add(edges);
  mesh.position.set(pb.x + ox, pb.y, pb.z);
  mesh.userData.id = pb.id;
  mesh.userData.contIdx = pb.contIdx;
  return mesh;
}

// ── AABB ──────────────────────────────────────────────────────
function getAABB(pb) {
  const bt = boxState.boxTypes.find(b => b.id === pb.typeId);
  if (!bt) return null;
  return { minX: pb.x-bt.w/2, maxX: pb.x+bt.w/2, minY: pb.y-bt.h/2, maxY: pb.y+bt.h/2, minZ: pb.z-bt.d/2, maxZ: pb.z+bt.d/2 };
}
function overlaps(a, b) {
  return a.maxX > b.minX+EPS && a.minX < b.maxX-EPS &&
         a.maxY > b.minY+EPS && a.minY < b.maxY-EPS &&
         a.maxZ > b.minZ+EPS && a.minZ < b.maxZ-EPS;
}
function isOutOfContainer(aabb, c) {
  return aabb.minX < -(c.iW/2+1) || aabb.maxX > (c.iW/2+1) ||
         aabb.minZ < -(c.iD/2+1) || aabb.maxZ > (c.iD/2+1) ||
         aabb.minY < -1           || aabb.maxY > (c.iH+1);
}

// ── HEIGHT MAP ────────────────────────────────────────────────
function makeHM(iW, iD, res) {
  const cols = Math.ceil(iW/res), rows = Math.ceil(iD/res);
  return { map: new Float32Array(cols*rows), cols, rows, res, iW, iD };
}
function hmGet(hm, lx, lz, w, d) {
  const x0=Math.floor((lx-w/2+hm.iW/2)/hm.res), x1=Math.ceil((lx+w/2+hm.iW/2)/hm.res);
  const z0=Math.floor((lz-d/2+hm.iD/2)/hm.res), z1=Math.ceil((lz+d/2+hm.iD/2)/hm.res);
  let maxH=0;
  for (let xi=Math.max(0,x0); xi<Math.min(hm.cols,x1); xi++)
    for (let zi=Math.max(0,z0); zi<Math.min(hm.rows,z1); zi++)
      maxH=Math.max(maxH, hm.map[zi*hm.cols+xi]);
  return maxH;
}
function hmSet(hm, lx, lz, w, d, h) {
  const x0=Math.floor((lx-w/2+hm.iW/2)/hm.res), x1=Math.ceil((lx+w/2+hm.iW/2)/hm.res);
  const z0=Math.floor((lz-d/2+hm.iD/2)/hm.res), z1=Math.ceil((lz+d/2+hm.iD/2)/hm.res);
  for (let xi=Math.max(0,x0); xi<Math.min(hm.cols,x1); xi++)
    for (let zi=Math.max(0,z0); zi<Math.min(hm.rows,z1); zi++)
      hm.map[zi*hm.cols+xi]=Math.max(hm.map[zi*hm.cols+xi], h);
}

// ── AUTO ARRANGE ──────────────────────────────────────────────
function autoArrange() {
  sliceAxis = null;
  document.querySelectorAll('.slice-btn').forEach(b => b.classList.remove('active'));
  const sw = document.getElementById('sliceSliderWrap');
  if (sw) sw.style.display = 'none';
  const ct = boxState.containers[activeContIdx];
  ct.placedBoxes.forEach(pb => { disposeMesh(meshMap[pb.id]); delete meshMap[pb.id]; });
  ct.placedBoxes = [];
  const c = CONTAINERS[boxState.containerType];
  const ci = activeContIdx, ox = contOffsetX(ci), GAP = 0;
  const items = [];
  boxState.boxTypes.forEach(bt => {
    const qty = bt.qty || 0; if (!qty) return;
    const vol = bt.w*bt.h*bt.d;
    for (let i=0; i<qty; i++) items.push({ bt, vol });
  });
  items.sort((a,b) => b.vol-a.vol);
  const HM_RES = 50, hm = makeHM(c.iW, c.iD, HM_RES);
  let unplaced = 0;
  items.forEach(({ bt }) => {
    const { w, h, d } = bt;
    let bestX=null, bestZ=null, bestY=Infinity;
    for (let xi=0; xi*HM_RES<c.iW; xi++) {
      const lx = -c.iW/2+w/2+xi*HM_RES; if (lx+w/2>c.iW/2) break;
      for (let zi=0; zi*HM_RES<c.iD; zi++) {
        const lz = -c.iD/2+d/2+zi*HM_RES; if (lz+d/2>c.iD/2) break;
        const baseY = hmGet(hm,lx,lz,w+GAP,d+GAP), ly = baseY+h/2;
        if (ly+h/2>c.iH) continue;
        const aabb = { minX:lx-w/2, maxX:lx+w/2, minY:ly-h/2, maxY:ly+h/2, minZ:lz-d/2, maxZ:lz+d/2 };
        if (isOutOfContainer(aabb,c)) continue;
        const hit = ct.placedBoxes.some(pb => overlaps(aabb, getAABB(pb)));
        if (hit) continue;
        if (ly<bestY) { bestY=ly; bestX=lx; bestZ=lz; }
      }
    }
    if (bestX !== null) {
      const id = Date.now()+Math.random();
      const pb = { id, typeId:bt.id, x:bestX, y:bestY, z:bestZ, contIdx:ci };
      ct.placedBoxes.push(pb);
      const mesh = makeMesh(pb, ox);
      mesh.userData.id = id;
      scene.add(mesh); meshMap[id] = mesh;
      hmSet(hm, bestX, bestZ, bt.w+GAP, bt.d+GAP, bestY+bt.h/2+GAP);
    } else { unplaced++; }
  });
  if (unplaced>0) showToast(`⚠️ 공간 부족으로 ${unplaced}개 배치 못했어요`);
  saveBoxState(); updateStats(); renderContainerTabs(); renderBoxList(); renderPlacedList(); applySlice();
}

// ── MANUAL PLACE ──────────────────────────────────────────────
function placePart(hitPoint) {
  if (!selectedBoxId) return;
  const bt = boxState.boxTypes.find(b => b.id === selectedBoxId); if (!bt) return;
  const ct = boxState.containers[activeContIdx];
  const placed = ct.placedBoxes.filter(pb => pb.typeId === selectedBoxId).length;
  if (placed >= bt.qty) { showToast(`${bt.name} 수량이 모두 배치됐어요 (${bt.qty}개)`); return; }
  const c = CONTAINERS[boxState.containerType], ox = contOffsetX(activeContIdx);
  let lx = hitPoint.x-ox, lz = hitPoint.z;
  lx = Math.max(-c.iW/2+bt.w/2, Math.min(c.iW/2-bt.w/2, lx));
  lz = Math.max(-c.iD/2+bt.d/2, Math.min(c.iD/2-bt.d/2, lz));
  let topY = 0;
  ct.placedBoxes.forEach(pb => {
    const bb = getAABB(pb); if (!bb) return;
    if ((lx+bt.w/2-EPS)>bb.minX && (lx-bt.w/2+EPS)<bb.maxX && (lz+bt.d/2-EPS)>bb.minZ && (lz-bt.d/2+EPS)<bb.maxZ)
      topY = Math.max(topY, bb.maxY);
  });
  const ly = topY+bt.h/2;
  if (ly+bt.h/2>c.iH) { showToast('⚠️ 높이 초과'); return; }
  const aabb = { minX:lx-bt.w/2, maxX:lx+bt.w/2, minY:ly-bt.h/2, maxY:ly+bt.h/2, minZ:lz-bt.d/2, maxZ:lz+bt.d/2 };
  if (isOutOfContainer(aabb,c)) { showToast('⚠️ 컨테이너 밖으로 넘어가요'); return; }
  const id = Date.now()+Math.random();
  const pb = { id, typeId:bt.id, x:lx, y:ly, z:lz, contIdx:activeContIdx };
  ct.placedBoxes.push(pb);
  const mesh = makeMesh(pb, ox);
  mesh.userData.id = id; scene.add(mesh); meshMap[id] = mesh;
  saveBoxState(); updateStats(); renderBoxList(); renderPlacedList();
  const nowPlaced = ct.placedBoxes.filter(pb2 => pb2.typeId === selectedBoxId).length;
  if (nowPlaced >= bt.qty) { selectedBoxId=null; document.getElementById('placeHint').classList.remove('show'); renderBoxList(); }
}

function removeBox(id) {
  boxState.containers.forEach(ct => {
    const i = ct.placedBoxes.findIndex(pb => pb.id === id);
    if (i >= 0) {
      ct.placedBoxes.splice(i, 1);
      disposeMesh(meshMap[id]);
      delete meshMap[id];
    }
  });
  saveBoxState(); updateStats(); renderBoxList(); renderPlacedList();
}

function clearAll() {
  Object.values(meshMap).forEach(m => disposeMesh(m));
  meshMap = {};
  boxState.containers.forEach(ct => { ct.placedBoxes = []; });
  selectedBoxId = null; document.getElementById('placeHint').classList.remove('show');
  saveBoxState(); updateStats(); renderBoxList(); renderPlacedList();
}

// ── BOX TYPE MANAGEMENT ───────────────────────────────────────
function addBoxType() {
  const name=document.getElementById('fName').value.trim(), w=parseInt(document.getElementById('fW').value),
        h=parseInt(document.getElementById('fH').value), d=parseInt(document.getElementById('fD').value),
        qty=parseInt(document.getElementById('fQty').value), color=document.getElementById('fColor').value;
  if (!name) return showToast('이름을 입력하세요');
  if (!w||!h||!d) return showToast('크기(W, H, D)를 입력하세요');
  if (!qty||qty<1) return showToast('수량을 입력하세요');
  const c = CONTAINERS[boxState.containerType];
  if (w>c.iW||h>c.iH||d>c.iD) return showToast('박스가 컨테이너보다 커요');
  const id = Date.now();
  boxState.boxTypes.push({ id, name, w, h, d, color, qty });
  saveBoxState(); renderBoxList();
  document.getElementById('fName').value=''; document.getElementById('fW').value='';
  document.getElementById('fH').value=''; document.getElementById('fD').value=''; document.getElementById('fQty').value='';
  showToast(`✅ "${name}" 등록 완료`);
}

function removeBoxType(id) {
  boxState.boxTypes = boxState.boxTypes.filter(b => b.id !== id);
  boxState.containers.forEach(ct => {
    ct.placedBoxes.filter(pb => pb.typeId === id).forEach(pb => {
      disposeMesh(meshMap[pb.id]);
      delete meshMap[pb.id];
    });
    ct.placedBoxes = ct.placedBoxes.filter(pb => pb.typeId !== id);
  });
  if (selectedBoxId === id) { selectedBoxId=null; document.getElementById('placeHint').classList.remove('show'); }
  saveBoxState(); updateStats(); renderBoxList(); renderPlacedList();
}

function setBoxQty(id, val) {
  const bt = boxState.boxTypes.find(b => b.id===id); if (!bt) return;
  bt.qty = Math.max(0, parseInt(val)||0); saveBoxState(); renderBoxList();
}

function selectBoxType(id) {
  selectedBoxId = selectedBoxId===id ? null : id; renderBoxList();
  const hint = document.getElementById('placeHint');
  if (selectedBoxId) hint.classList.add('show'); else hint.classList.remove('show');
}

// ── CONTAINER MANAGEMENT ─────────────────────────────────────
function addContainer() {
  if (boxState.containers.length>=4) return showToast('컨테이너는 최대 4개');
  boxState.containers.push(defaultBoxContState());
  saveBoxState(); buildAllContainers(); rebuildMeshes(); renderContainerTabs(); updateStats();
}

function removeContainer(idx) {
  if (boxState.containers.length<=1) return showToast('최소 1개 필요');
  boxState.containers[idx].placedBoxes.forEach(pb => {
    disposeMesh(meshMap[pb.id]);
    delete meshMap[pb.id];
  });
  boxState.containers.splice(idx,1);
  if (activeContIdx>=boxState.containers.length) activeContIdx=boxState.containers.length-1;
  saveBoxState(); buildAllContainers(); rebuildMeshes(); renderContainerTabs(); renderPlacedList(); updateStats();
}

function selectContainer(idx) {
  activeContIdx=idx; sliceAxis=null;
  document.querySelectorAll('.slice-btn').forEach(b => b.classList.remove('active'));
  const sw=document.getElementById('sliceSliderWrap'); if (sw) sw.style.display='none';
  buildAllContainers(); rebuildMeshes(); renderContainerTabs(); renderPlacedList(); updateStats();
  const c=CONTAINERS[boxState.containerType]; camTarget={x:contOffsetX(idx), y:c.iH/2, z:0}; updateCamera();
}

// ── SLICE ─────────────────────────────────────────────────────
function setSlice(axis) {
  if (sliceAxis===axis) {
    sliceAxis=null; document.querySelectorAll('.slice-btn').forEach(b => b.classList.remove('active'));
    Object.values(meshMap).forEach(m => { if(m) m.visible=true; });
  } else {
    sliceAxis=axis;
    const c=CONTAINERS[boxState.containerType]; sliceValue=axis==='y'?c.iH/2:0;
    document.querySelectorAll('.slice-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.slice-btn[data-axis="${axis}"]`)?.classList.add('active');
  }
  updateSliceSlider(); applySlice();
}

function updateSliceSlider() {
  const wrap=document.getElementById('sliceSliderWrap'); if (!wrap) return;
  if (!sliceAxis) { wrap.style.display='none'; return; }
  const c=CONTAINERS[boxState.containerType];
  let min,max;
  if (sliceAxis==='x'){min=-c.iW/2;max=c.iW/2;} else if (sliceAxis==='y'){min=0;max=c.iH;} else{min=-c.iD/2;max=c.iD/2;}
  wrap.style.display='flex';
  const slider=document.getElementById('sliceSlider');
  slider.min=min; slider.max=max; slider.step=Math.round((max-min)/100); slider.value=sliceValue;
  document.getElementById('sliceVal').textContent=Math.round(sliceValue)+' mm';
}

function onSliceSlider(val) {
  sliceValue=parseFloat(val); document.getElementById('sliceVal').textContent=Math.round(sliceValue)+' mm'; applySlice();
}

function applySlice() {
  boxState.containers.forEach(ct => {
    ct.placedBoxes.forEach(pb => {
      const mesh=meshMap[pb.id]; if (!mesh) return;
      if (!sliceAxis) { mesh.visible=true; return; }
      const pos=sliceAxis==='x'?pb.x:sliceAxis==='y'?pb.y:pb.z;
      mesh.visible=pos<=sliceValue;
    });
  });
}

// ── VIEW ──────────────────────────────────────────────────────
function setView(v) {
  const c=CONTAINERS[boxState.containerType], cx=contOffsetX(activeContIdx), cy=c.iH/2;
  camTarget={x:cx,y:cy,z:0};
  if (v==='front'){camTheta=0;camPhi=Math.PI/3.5;}
  else if (v==='top'){camTheta=0;camPhi=0.05;}
  else if (v==='side'){camTheta=Math.PI/2;camPhi=Math.PI/3.5;}
  else{camTheta=Math.PI/4;camPhi=Math.PI/3.5;}
  updateCamera();
}

function updateCamera() {
  camera.position.set(
    camTarget.x+camRadius*Math.sin(camPhi)*Math.sin(camTheta),
    camTarget.y+camRadius*Math.cos(camPhi),
    camTarget.z+camRadius*Math.sin(camPhi)*Math.cos(camTheta)
  );
  camera.lookAt(camTarget.x, camTarget.y, camTarget.z);
}

// ── STATS ─────────────────────────────────────────────────────
function updateStats() {
  const c=CONTAINERS[boxState.containerType], ct=boxState.containers[activeContIdx];
  const totalBoxes=ct.placedBoxes.length;
  const vol=ct.placedBoxes.reduce((s,pb) => { const bt=boxState.boxTypes.find(b=>b.id===pb.typeId); return bt?s+bt.w*bt.h*bt.d:s; },0);
  const contVol=c.iW*c.iH*c.iD, pct=contVol>0?(vol/contVol*100).toFixed(1):'0.0';
  document.getElementById('hudCont').textContent=`${boxState.containerType} #${activeContIdx+1}`;
  document.getElementById('hudCount').textContent=totalBoxes;
  document.getElementById('loadPct').textContent=pct;
  document.getElementById('navUtil').textContent=pct;
  document.getElementById('navCont').textContent=boxState.containerType;
}

// ── RENDER UI ─────────────────────────────────────────────────
function renderContainerTabs() {
  const el=document.getElementById('contTabs'); if (!el) return;
  el.innerHTML=boxState.containers.map((ct,idx) => `
    <div class="cont-tab ${activeContIdx===idx?'active':''}" onclick="selectContainer(${idx})">
      <span>${idx+1} ${boxState.containerType}</span>
      <span style="color:var(--text-dim);font-size:9px">${ct.placedBoxes.length}개</span>
      ${boxState.containers.length>1?`<button class="cont-tab-rm" onclick="event.stopPropagation();removeContainer(${idx})">×</button>`:''}
    </div>
  `).join('')+(boxState.containers.length<4?`<button class="cont-add-btn" onclick="addContainer()">＋ 추가</button>`:'');
}

function renderBoxList() {
  const el=document.getElementById('boxList'); if (!el) return;
  if (!boxState.boxTypes.length) { el.innerHTML='<div style="color:var(--text-dim);font-size:11px;text-align:center;padding:20px 0">등록된 박스가 없어요<br>위 폼으로 추가하세요</div>'; return; }
  const ct=boxState.containers[activeContIdx];
  el.innerHTML=boxState.boxTypes.map(bt => {
    const placed=ct.placedBoxes.filter(pb=>pb.typeId===bt.id).length;
    const pct=bt.qty>0?Math.min(100,placed/bt.qty*100):0, isSel=selectedBoxId===bt.id;
    return `
    <div class="box-item ${isSel?'selected':''}" onclick="selectBoxType(${bt.id})">
      <div class="box-item-header">
        <div class="box-dot" style="background:${bt.color}"></div>
        <span class="box-name" style="color:${isSel?bt.color:'var(--text)'}">${bt.name}</span>
        <button class="box-rm-btn" onclick="event.stopPropagation();removeBoxType(${bt.id})">✕</button>
      </div>
      <div class="box-dims-label">${bt.w} × ${bt.h} × ${bt.d} mm</div>
      <div class="box-controls" style="margin-top:7px">
        <span style="font-size:9px;color:var(--text-dim);margin-right:2px">수량</span>
        <button class="box-qty-btn" onclick="event.stopPropagation();setBoxQty(${bt.id},${Math.max(0,(bt.qty||0)-1)})">−</button>
        <input class="box-qty-input" type="number" value="${bt.qty||0}" min="0" max="999"
          onclick="event.stopPropagation()" onchange="setBoxQty(${bt.id},this.value)">
        <button class="box-qty-btn" onclick="event.stopPropagation();setBoxQty(${bt.id},${(bt.qty||0)+1})">＋</button>
        <span style="font-size:9px;color:var(--text-dim);margin-left:4px">${placed}/${bt.qty} 배치</span>
      </div>
      <div class="box-progress-wrap">
        <div class="box-progress-bar" style="width:${pct}%;background:${bt.color}"></div>
      </div>
    </div>`;
  }).join('');
}

function renderPlacedList() {
  const el=document.getElementById('placedList'); if (!el) return;
  const ct=boxState.containers[activeContIdx];
  if (!ct.placedBoxes.length) { el.innerHTML='<div style="color:var(--text-dim);font-size:11px;text-align:center;padding:20px 0">배치된 박스 없음</div>'; return; }
  el.innerHTML=ct.placedBoxes.map((pb) => {
    const bt=boxState.boxTypes.find(b=>b.id===pb.typeId); if (!bt) return '';
    return `
    <div class="placed-item ${highlightedId===pb.id?'hl':''}" onclick="doHighlight(${pb.id})">
      <div style="width:8px;height:8px;border-radius:2px;background:${bt.color};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${bt.name}</div>
        <div style="font-size:9px;color:var(--text-dim);font-family:var(--font-mono)">${bt.w}×${bt.h}×${bt.d}</div>
      </div>
      <button onclick="event.stopPropagation();removeBox(${pb.id})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:11px;opacity:.5" title="삭제">✕</button>
    </div>`;
  }).join('');
}

// ── HIGHLIGHT ─────────────────────────────────────────────────
function doHighlight(id) {
  if (highlightedId===id) { clearHighlight(); return; }
  if (highlightedId&&meshMap[highlightedId]) { meshMap[highlightedId].material.emissive=new THREE.Color(0); meshMap[highlightedId].material.emissiveIntensity=0; }
  highlightedId=id;
  const mesh=meshMap[id];
  if (mesh) { mesh.material.emissive=new THREE.Color(0xffffff); mesh.material.emissiveIntensity=0.28; }
  showInfoPopup(id); renderPlacedList();
}

function clearHighlight() {
  if (highlightedId&&meshMap[highlightedId]) { meshMap[highlightedId].material.emissive=new THREE.Color(0); meshMap[highlightedId].material.emissiveIntensity=0; }
  highlightedId=null; hideInfoPopup(); renderPlacedList();
}

function showInfoPopup(id) {
  let pb=null, contIdx=-1;
  boxState.containers.forEach((ct,ci) => { const f=ct.placedBoxes.find(p=>p.id===id); if(f){pb=f;contIdx=ci;} });
  if (!pb) return;
  const bt=boxState.boxTypes.find(b=>b.id===pb.typeId); if (!bt) return;
  const vol=(bt.w*bt.h*bt.d/1e9).toFixed(4);
  let popup=document.getElementById('infoPopup');
  if (!popup) {
    popup=document.createElement('div'); popup.id='infoPopup';
    popup.style.cssText=`position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(10,14,20,0.93);border:1px solid var(--accent);border-radius:8px;padding:12px 18px;font-family:var(--font-mono);font-size:11px;color:var(--text);backdrop-filter:blur(10px);pointer-events:none;z-index:100;min-width:220px;box-shadow:0 4px 24px rgba(0,0,0,.5);`;
    document.querySelector('.viewport-wrap').appendChild(popup);
  }
  popup.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="width:10px;height:10px;border-radius:2px;background:${bt.color};flex-shrink:0"></div>
      <span style="font-size:13px;font-weight:700;color:${bt.color}">${bt.name}</span>
    </div>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 12px;color:var(--text-dim)">
      <span>크기</span><span style="color:var(--text)">${bt.w} × ${bt.h} × ${bt.d} mm</span>
      <span>체적</span><span style="color:var(--green)">${vol} m³</span>
      <span>위치 X,Y,Z</span><span style="color:var(--text)">${Math.round(pb.x)}, ${Math.round(pb.y)}, ${Math.round(pb.z)}</span>
      <span>컨테이너</span><span style="color:var(--accent)">#${contIdx+1}</span>
    </div>`;
  popup.style.display='block';
}

function hideInfoPopup() { const p=document.getElementById('infoPopup'); if(p) p.style.display='none'; }

// ── RAYCAST ───────────────────────────────────────────────────
function doRaycastHighlight(clientX, clientY, canvas) {
  const rect=canvas.getBoundingClientRect();
  mouse.x=((clientX-rect.left)/rect.width)*2-1; mouse.y=-((clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects(Object.values(meshMap).filter(Boolean),true);
  if (!hits.length) { clearHighlight(); return; }
  let obj=hits[0].object, id=obj.userData.id;
  while (id===undefined&&obj.parent) { obj=obj.parent; id=obj.userData.id; }
  if (id!==undefined) doHighlight(id);
}

function doRaycastPlace(clientX, clientY, canvas) {
  if (!selectedBoxId) return;
  const rect=canvas.getBoundingClientRect();
  mouse.x=((clientX-rect.left)/rect.width)*2-1; mouse.y=-((clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const floors=containerObjects.map(o=>o.floor).filter(Boolean);
  const all=[...floors,...Object.values(meshMap)].filter(Boolean);
  const hits=raycaster.intersectObjects(all,false);
  if (!hits.length) return;
  placePart(hits[0].point);
}

// ── EVENTS ────────────────────────────────────────────────────
function setupEvents(canvas) {
  canvas.addEventListener('mousedown', e => { orbit.active=true; orbit.right=e.button===2; orbit.lx=e.clientX; orbit.ly=e.clientY; orbit.moved=false; });
  window.addEventListener('mouseup', () => { orbit.active=false; });
  window.addEventListener('mousemove', e => {
    if (!orbit.active) return;
    const dx=e.clientX-orbit.lx, dy=e.clientY-orbit.ly;
    if (Math.abs(dx)>2||Math.abs(dy)>2) orbit.moved=true;
    orbit.lx=e.clientX; orbit.ly=e.clientY;
    if (orbit.right) {
      const right=new THREE.Vector3(-Math.cos(camTheta),0,Math.sin(camTheta));
      camTarget.x+=right.x*dx*10; camTarget.z+=right.z*dx*10; camTarget.y+=dy*10;
    } else { camTheta-=dx*0.005; camPhi=Math.max(0.05,Math.min(Math.PI*0.48,camPhi-dy*0.005)); }
    updateCamera();
  });
  canvas.addEventListener('wheel', e => { camRadius=Math.max(2000,Math.min(200000,camRadius+e.deltaY*20)); updateCamera(); e.preventDefault(); }, {passive:false});
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('click', e => {
    if (orbit.moved) return;
    if (!selectedBoxId) { doRaycastHighlight(e.clientX,e.clientY,canvas); return; }
    doRaycastPlace(e.clientX,e.clientY,canvas);
  });
  let touch={active:false,lx:0,ly:0,dist:0,moved:false,pinch:false};
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (e.touches.length===1){touch.active=true;touch.pinch=false;touch.moved=false;touch.lx=e.touches[0].clientX;touch.ly=e.touches[0].clientY;}
    else if (e.touches.length===2){touch.pinch=true;touch.dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}
  },{passive:false});
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length===2&&touch.pinch){const d2=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);camRadius=Math.max(2000,Math.min(200000,camRadius+(touch.dist-d2)*80));touch.dist=d2;updateCamera();}
    else if (e.touches.length===1&&touch.active){const dx=e.touches[0].clientX-touch.lx,dy=e.touches[0].clientY-touch.ly;if(Math.abs(dx)>2||Math.abs(dy)>2)touch.moved=true;touch.lx=e.touches[0].clientX;touch.ly=e.touches[0].clientY;camTheta-=dx*0.006;camPhi=Math.max(0.05,Math.min(Math.PI*0.48,camPhi-dy*0.006));updateCamera();}
  },{passive:false});
  canvas.addEventListener('touchend', e => {
    if (!touch.moved&&e.changedTouches.length===1){if(!selectedBoxId)doRaycastHighlight(e.changedTouches[0].clientX,e.changedTouches[0].clientY,canvas);else doRaycastPlace(e.changedTouches[0].clientX,e.changedTouches[0].clientY,canvas);}
    touch.active=false;
  });
  window.addEventListener('resize', () => {
    const vp=canvas.parentElement;
    camera.aspect=vp.clientWidth/vp.clientHeight; camera.updateProjectionMatrix();
    renderer.setSize(vp.clientWidth,vp.clientHeight);
  });
}

// ── ANIMATE ───────────────────────────────────────────────────
function animate() { requestAnimationFrame(animate); renderer.render(scene,camera); }

// ── TOAST ─────────────────────────────────────────────────────
let toastTimer=null;
function showToast(msg) {
  const el=document.getElementById('toast'); if (!el) return;
  el.textContent=msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
}

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (!boxState.containerType) boxState.containerType='ST';
  initThree(); renderContainerTabs(); renderBoxList(); renderPlacedList(); updateStats();
  const c=CONTAINERS[boxState.containerType];
  camTarget={x:0,y:c.iH/2,z:0}; camRadius=Math.max(c.iW,c.iD,c.iH)*2; updateCamera();
});