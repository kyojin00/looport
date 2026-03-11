// pallet-ui.js — UI 업데이트, resize, animate

function updateUI() {
  updatePalletList();
  updateSelectedInfo();
  updateBoxList();
  updateStats();
}

// ============================================================
// RESIZE
// ============================================================
function resize() {
  const area = canvas.parentElement;
  const w = area.clientWidth;
  // 모바일: 탭바(52px) 제외
  const isMob = window.innerWidth <= 768;
  const tabbarH = isMob ? 52 : 0;
  const h = area.clientHeight - tabbarH;
  renderer.setSize(Math.max(w, 1), Math.max(h, 1));
  camera.aspect = Math.max(w, 1) / Math.max(h, 1);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
// iOS에서 orientation 변경 시 재조정
window.addEventListener('orientationchange', () => setTimeout(resize, 300));
resize();

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
updateCamera();
onTypeChange(); // 초기 타입 설정