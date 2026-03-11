// viewer.js — 전역 변수 & 초기화
// 분리된 파일: viewer-three.js, viewer-arrange.js, viewer-ui.js, viewer-slice.js

let state = loadState();
let selectedCode = null;
let selectedOrient = 'flat';
let activeContIdx = 0; // 현재 선택된 컨테이너 인덱스
let fillHeight = 2400;  // 자동배치 최대 높이 (mm), 기본 2100

// ── 색상 커스텀 (코드 → hex string) ─────────────────────────
let customColors = {}; // { 'A': '#4a9eff', ... }

function getPartColor(code) {
  if (customColors[code]) return customColors[code];
  const p = PARTS_DEF.find(x => x.code === code);
  return p ? p.color : '#888888';
}

function setPartColor(code, hex) {
  customColors[code] = hex;
  // 씬에 있는 해당 코드 메시 색상 즉시 업데이트
  state.containers.forEach(ct => {
    ct.placedParts.filter(pp => pp.code === code).forEach(pp => {
      const group = meshMap[pp.id];
      if (!group) return;
      const col = new THREE.Color(hex);
      group.traverse(child => {
        if (child.isMesh && child.material && child.material.color) {
          // 슬롯(검정) 등 특수 재질 제외
          if (child.material.color.getHex() !== 0x111111) {
            child.material.color.set(col);
          }
        }
      });
    });
  });
  renderPartPicker();
}

// ── 단면/레이어/하이라이트 상태 ──────────────────────────────
let sliceAxis = null;    // 'x'|'y'|'z'|null
let sliceValue = 0;      // 슬라이스 위치 (mm, 내부 로컬좌표)
let visibleCodes = null;  // Set<string> or null(전체표시)
let highlightedId = null; // 하이라이트된 부품 id