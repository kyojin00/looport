// pallet-three.js — Three.js 초기화, 카메라, 마우스/터치 이벤트

// GLTFLoader r128 inline
// Source: three.js/examples/js/loaders/GLTFLoader.js (r128)


let pallets = [];
let selectedPalletId = null;
let selectedBoxId = null;
let selectedColor = '#e8aa5a';
let showGrid = true;
let palletCounter = 1;
let boxCounter = 1;

const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc8d4dc);

const camera = new THREE.PerspectiveCamera(45, 1, 1, 20000);
camera.position.set(3000, 2500, 3500);
camera.lookAt(0, 0, 0);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(3000, 4000, 2000);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 100;
dirLight.shadow.camera.far = 15000;
dirLight.shadow.camera.left = -5000;
dirLight.shadow.camera.right = 5000;
dirLight.shadow.camera.top = 5000;
dirLight.shadow.camera.bottom = -5000;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
fillLight.position.set(-2000, 2000, -1000);
scene.add(fillLight);

const backLight = new THREE.DirectionalLight(0xddeeff, 0.5);
backLight.position.set(0, 1000, -3000);
scene.add(backLight);

const gridHelper = new THREE.GridHelper(12000, 60, 0x99aabb, 0xaabbcc);
gridHelper.position.y = -1;
scene.add(gridHelper);

// Axes
const axesHelper = new THREE.AxesHelper(500);
axesHelper.position.set(-4000, 0, -4000);
scene.add(axesHelper);

let spherical = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 5500 };
let target = new THREE.Vector3(0, 300, 0);

// orbit 상태 — 박스 뷰어 방식으로 통일
let orbit = { active: false, right: false, lx: 0, ly: 0, moved: false };

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');

function updateCamera() {
  const x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
  const y = target.y + spherical.radius * Math.cos(spherical.phi);
  const z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
  camera.position.set(x, y, z);
  camera.lookAt(target);
}

// ── 마우스 이벤트 ──────────────────────────────────────────────
canvas.addEventListener('mousedown', e => {
  orbit.active = true;
  orbit.right  = e.button === 2;
  orbit.lx     = e.clientX;
  orbit.ly     = e.clientY;
  orbit.moved  = false;
  e.preventDefault();
});

window.addEventListener('mouseup', () => { orbit.active = false; });

window.addEventListener('mousemove', e => {
  if (!orbit.active) return;
  const dx = e.clientX - orbit.lx;
  const dy = e.clientY - orbit.ly;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) orbit.moved = true;
  orbit.lx = e.clientX;
  orbit.ly = e.clientY;

  if (orbit.right) {
    // 우클릭 드래그 → 패닝
    const right = new THREE.Vector3();
    right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
    target.addScaledVector(right, -dx * spherical.radius * 0.001);
    target.addScaledVector(camera.up, dy * spherical.radius * 0.001);
  } else {
    // 좌클릭 드래그 → 회전
    spherical.theta -= dx * 0.005;
    spherical.phi = Math.max(0.05, Math.min(Math.PI * 0.48, spherical.phi - dy * 0.005));
  }
  updateCamera();
});

canvas.addEventListener('click', e => {
  // 드래그 중이었으면 클릭 무시
  if (orbit.moved) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const allMeshes = [];
  scene.traverse(obj => {
    if (obj.isMesh && (obj.userData.type === 'pallet' || obj.userData.type === 'palletTop'))
      allMeshes.push(obj);
  });
  const hits = raycaster.intersectObjects(allMeshes);
  if (hits.length > 0 && hits[0].object.userData.palletId)
    selectPallet(hits[0].object.userData.palletId);
});

canvas.addEventListener('wheel', e => {
  spherical.radius = Math.max(300, Math.min(18000, spherical.radius + e.deltaY * 1.5));
  updateCamera();
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('contextmenu', e => e.preventDefault());

// ── 터치 이벤트 ────────────────────────────────────────────────
let touch = { active: false, lx: 0, ly: 0, dist: 0, moved: false, pinch: false };

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    touch.active = true;
    touch.pinch  = false;
    touch.moved  = false;
    touch.lx     = e.touches[0].clientX;
    touch.ly     = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    touch.pinch = true;
    touch.dist  = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 2 && touch.pinch) {
    // 핀치 줌
    const d2 = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    spherical.radius = Math.max(300, Math.min(18000, spherical.radius * (touch.dist / d2)));
    touch.dist = d2;
    updateCamera();
  } else if (e.touches.length === 1 && touch.active) {
    // 1손가락 → 회전
    const dx = e.touches[0].clientX - touch.lx;
    const dy = e.touches[0].clientY - touch.ly;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) touch.moved = true;
    touch.lx = e.touches[0].clientX;
    touch.ly = e.touches[0].clientY;
    spherical.theta -= dx * 0.006;
    spherical.phi = Math.max(0.05, Math.min(Math.PI * 0.48, spherical.phi - dy * 0.006));
    updateCamera();
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  // 이동 없는 탭 → 파렛트 선택
  if (!touch.moved && e.changedTouches.length === 1) {
    const t = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    mouse.x =  ((t.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((t.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const allMeshes = [];
    scene.traverse(obj => {
      if (obj.isMesh && (obj.userData.type === 'pallet' || obj.userData.type === 'palletTop'))
        allMeshes.push(obj);
    });
    const hits = raycaster.intersectObjects(allMeshes);
    if (hits.length > 0 && hits[0].object.userData.palletId)
      selectPallet(hits[0].object.userData.palletId);
  }
  touch.active = false;
  touch.moved  = false;
});

