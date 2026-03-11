
// ── 햄버거 메뉴 ──────────────────────────────────────────────
function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const btn  = document.getElementById('hamburger');
  const isOpen = menu.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
}
document.addEventListener('click', e => {
  const menu = document.getElementById('mobileMenu');
  const btn  = document.getElementById('hamburger');
  if (!menu || !btn) return;
  if (!menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.remove('open'); btn.classList.remove('open');
  }
});

// ── 드로어 ───────────────────────────────────────────────────
window.currentDrawer = null;
const DRAWER_SLOTS = {
  cont:  () => document.getElementById('contTabs'),
  parts: () => document.getElementById('partPicker'),
  list:  () => document.getElementById('placedList'),
};
const originMap = {};

function openDrawer(type) {
  if (window.currentDrawer === type) { closeDrawer(); return; }
  if (window.currentDrawer) _restoreDOM(window.currentDrawer);
  window.currentDrawer = type;
  const titles = { cont:'컨테이너', parts:'부품 선택', list:'적재 목록' };
  document.getElementById('mobDrawerTitle').textContent = titles[type] || '';
  document.getElementById('mobDrawerActions').style.display = type === 'parts' ? 'flex' : 'none';
  document.querySelectorAll('.mob-tab-btn').forEach(b => b.classList.remove('active'));
  const btnMap = { cont:'mobBtnCont', parts:'mobBtnParts', list:'mobBtnList' };
  if (btnMap[type]) document.getElementById(btnMap[type])?.classList.add('active');
  const node = DRAWER_SLOTS[type]?.();
  if (node) {
    originMap[type] = { parent: node.parentElement, next: node.nextSibling };
    document.getElementById('mobDrawerContent').innerHTML = '';
    document.getElementById('mobDrawerContent').appendChild(node);
  }
  if (type === 'parts') renderPartPicker();
  else if (type === 'cont') renderContainerTabs();
  else if (type === 'list') renderPlacedList();
  document.getElementById('mobDrawer').classList.add('open');
  document.getElementById('mobOverlay').style.display = 'block';
}

function _restoreDOM(type) {
  const node = DRAWER_SLOTS[type]?.(), origin = originMap[type];
  if (node && origin?.parent) {
    if (origin.next) origin.parent.insertBefore(node, origin.next);
    else origin.parent.appendChild(node);
  }
}

function closeDrawer() {
  if (window.currentDrawer) _restoreDOM(window.currentDrawer);
  window.currentDrawer = null;
  document.getElementById('mobDrawer').classList.remove('open');
  document.getElementById('mobOverlay').style.display = 'none';
  document.getElementById('mobDrawerContent').innerHTML = '';
  document.querySelectorAll('.mob-tab-btn').forEach(b => b.classList.remove('active'));
}

// ── updateStats 후킹 — viewer.js 로드 직후 패치 ─────────────────
function _patchUpdateStats() {
  if (typeof updateStats === 'undefined') {
    setTimeout(_patchUpdateStats, 50);
    return;
  }
  const _orig = updateStats;
  window.updateStats = function() {
    _orig.apply(this, arguments);
    updateRsHud();
  };
  // 초기 렌더: 레이아웃 확정 후 여러 번 시도
  setTimeout(updateRsHud, 300);
  setTimeout(updateRsHud, 800);
  setTimeout(updateRsHud, 1500);
}
_patchUpdateStats();

// ═══════════════════════════════════════════════════════════════
// ── 우측 HUD 로직 ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

let rsMmapView = 'side';
const rsSlicePct = 100; // 슬라이더 제거 — 항상 전체 표시

// 색상 0%→초록 50%→노랑 100%→빨강
function rsGetColor(pct) {
  const r = pct < 50 ? Math.round(pct * 2 * 255 / 100) : 255;
  const g = pct < 50 ? 200 : Math.round((1 - (pct - 50) / 50) * 200);
  return `rgb(${r},${g},50)`;
}

function updateRsHud() {
  if (typeof state === 'undefined' || typeof PARTS_DEF === 'undefined') return;
  const c = CONTAINERS[state.containerType];
  if (!c) return;

  // viewer.js는 ct.userQty(컨테이너별) 구조 사용
  function getTargetQty(code) {
    if (state.userQty && state.userQty[code] != null) return state.userQty[code];
    return (state.containers && state.containers[0] && state.containers[0].userQty)
      ? (state.containers[0].userQty[code] ?? 0) : 0;
  }

  // ── ① 게이지 ──────────────────────────────────────────────
  const totalQty    = PARTS_DEF.reduce((s, p) => s + getTargetQty(p.code), 0);
  const totalPlaced = (state.containers ?? []).reduce((s, ct) => s + (ct.placedParts?.length ?? 0), 0);
  const pct   = totalQty > 0 ? Math.min(100, Math.round(totalPlaced / totalQty * 100)) : 0;
  const color = rsGetColor(pct);
  const C     = 2 * Math.PI * 28;

  const ring = document.getElementById('rsRingFill');
  if (ring) { ring.style.strokeDashoffset = C * (1 - pct / 100); ring.style.stroke = color; }
  const ringPct = document.getElementById('rsRingPct');
  if (ringPct) { ringPct.textContent = pct + '%'; ringPct.style.color = color; }

  const remain = Math.max(0, totalQty - totalPlaced);
  const elP = document.getElementById('rsPlaced');
  const elR = document.getElementById('rsRemain');
  const elC = document.getElementById('rsConts');
  if (elP) elP.textContent = totalPlaced;
  if (elR) { elR.textContent = remain; elR.style.color = remain > 0 ? '#f59e0b' : '#22d37f'; }
  if (elC) elC.textContent = state.containers?.length ?? 1;

  // 체적 점유율
  const vol  = c.iW * c.iH * c.iD * (state.containers?.length ?? 1);
  const used = (state.containers ?? []).reduce((t, ct) =>
    t + (ct.placedParts ?? []).reduce((s, pp) => {
      const p = PARTS_DEF.find(x => x.code === pp.code);
      if (!p) return s;
      const dims = (typeof getOrientedDims === 'function')
        ? getOrientedDims(p, pp.orient || 'flat')
        : { w: p.w, h: p.h, d: p.d };
      return s + dims.w * dims.h * dims.d;
    }, 0), 0);
  const volPct = vol > 0 ? Math.min(100, used / vol * 100) : 0;
  const volEl  = document.getElementById('rsVolPct');
  const volBar = document.getElementById('rsVolBar');
  if (volEl)  volEl.textContent = volPct.toFixed(1) + '%';
  if (volBar) {
    volBar.style.width      = volPct + '%';
    volBar.style.background = 'linear-gradient(90deg,#22d37f,' + rsGetColor(volPct) + ')';
  }

  // ── ② 부품별 프로그레스 바 ───────────────────────────────
  const rsPartRows = document.getElementById('rsPartRows');
  if (rsPartRows) {
    rsPartRows.innerHTML = PARTS_DEF.map(function(p) {
      const placed = (state.containers ?? []).reduce((s, ct) =>
        s + (ct.placedParts ?? []).filter(pp => pp.code === p.code).length, 0);
      const target = getTargetQty(p.code);
      if (target === 0 && placed === 0) return '';
      const barPct = target > 0 ? Math.min(100, placed / target * 100) : (placed > 0 ? 100 : 0);
      const rem    = Math.max(0, target - placed);
      return '<div class="rs-part-row">'
        + '<div class="rs-part-dot" style="background:' + p.color + '"></div>'
        + '<div class="rs-part-info">'
        + '<div class="rs-part-top">'
        + '<span class="rs-part-code" style="color:' + p.color + '">' + p.code + '</span>'
        + '<span class="rs-part-cnt"><span>' + placed + '</span>/' + target + '</span>'
        + '</div>'
        + '<div class="rs-part-bar-track">'
        + '<div class="rs-part-bar-fill" style="width:' + barPct + '%;background:' + p.color + '"></div>'
        + '</div></div>'
        + '<div class="rs-part-remain ' + (rem === 0 ? 'done' : 'left') + '">'
        + (rem === 0 ? '&#10003;' : rem + '개')
        + '</div></div>';
    }).join('');
  }

  // ── ③ 미니맵 ─────────────────────────────────────────────
  rsDrawMinimap();
}


// 미니맵 뷰 전환
function sbToggle(id) {
  const acc   = document.getElementById(id);
  const body  = document.getElementById('body-' + id);
  const arrow = document.getElementById('arr-'  + id);
  const closed = acc.classList.toggle('sb-acc-closed');
  if (body)  body.style.display  = closed ? 'none' : '';
  if (arrow) arrow.style.transform = closed ? 'rotate(-90deg)' : '';
}

function rsSetView(v, btn) {
  rsMmapView = v;

  document.querySelectorAll('.rs-mmap-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  rsDrawMinimap();
}



function rsDrawMinimap() {
  const canvas = document.getElementById('rsMinimap');
  if (!canvas || typeof state === 'undefined') return;
  // parentElement가 숨겨져 있으면 clientWidth=0 → 강제 fallback
  const W = Math.max(canvas.parentElement.clientWidth, canvas.parentElement.offsetWidth, 160);
  canvas.width  = W;
  canvas.height = 110;
  const H = 110;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const c   = CONTAINERS[state.containerType];
  const PAD = 8;

  // 뷰별 캔버스 치수 (mm 단위 범위)
  // XY(side): 수평=X(iW), 수직=Y(iH), 깊이=Z(iD)
  // XZ(top):  수평=X(iW), 수직=Z(iD), 깊이=Y(iH)
  // ZY(front):수평=Z(iD), 수직=Y(iH), 깊이=X(iW)
  let cW, cH;
  if      (rsMmapView === 'side')  { cW = c.iW; cH = c.iH; }
  else if (rsMmapView === 'top')   { cW = c.iW; cH = c.iD; }
  else                             { cW = c.iD; cH = c.iH; }

  const scale = Math.min((W - PAD*2) / cW, (H - PAD*2) / cH);
  const drawW = cW * scale;
  const drawH = cH * scale;
  const offX  = (W - drawW) / 2;
  const offY  = (H - drawH) / 2;

  // 컨테이너 외곽
  ctx.strokeStyle = '#2a3a4a';
  ctx.lineWidth   = 1;
  ctx.strokeRect(offX, offY, drawW, drawH);

  // 격자
  ctx.strokeStyle = '#141e28';
  ctx.lineWidth   = 0.5;
  for (let x = 0; x <= cW; x += 2000) {
    ctx.beginPath();
    ctx.moveTo(offX + x*scale, offY);
    ctx.lineTo(offX + x*scale, offY + drawH);
    ctx.stroke();
  }
  for (let y = 0; y <= cH; y += 1000) {
    ctx.beginPath();
    ctx.moveTo(offX,       offY + y*scale);
    ctx.lineTo(offX+drawW, offY + y*scale);
    ctx.stroke();
  }

  // 단면 깊이 (0 ~ 최대깊이 mm)
  // side: 깊이축=Z, 범위 0~iD
  // top:  깊이축=Y, 범위 0~iH
  // front:깊이축=X, 범위 0~iW
  const depthRange = rsMmapView === 'side'  ? c.iD
                   : rsMmapView === 'top'   ? c.iH
                   : c.iW;
  const sliceDepth = depthRange * rsSlicePct / 100;

  // 부품 그리기
  // pp 로컬 좌표: x∈[-iW/2,+iW/2], y∈[0,iH], z∈[-iD/2,+iD/2]
  // 캔버스 좌표로 변환 시 각 축의 min을 0으로 맞춤:
  //   X → px = pp.x + iW/2         (0 ~ iW)
  //   Y → py = iH - pp.y            (위가 0, 아래가 iH → 반전)
  //   Z → pz = pp.z + iD/2          (0 ~ iD)

  // 활성 컨테이너만 표시
  const _activeIdx = typeof activeContIdx !== 'undefined' ? activeContIdx : 0;
  const _activeCt  = (state.containers ?? [])[_activeIdx];
  if (!_activeCt) return;

  (_activeCt.placedParts ?? []).forEach(pp => {
      const p = PARTS_DEF.find(x => x.code === pp.code);
      if (!p) return;
      const dims = getOrientedDims(p, pp.orient || 'flat');

      // 로컬 좌표 → 0-based 좌표
      const lx = pp.x + c.iW/2;   // 0 ~ iW
      const ly = pp.y;             // 0 ~ iH  (바닥=0)
      const lz = pp.z + c.iD/2;   // 0 ~ iD

      let px, py, pw, ph, depth;

      if (rsMmapView === 'side') {
        px    = lx - dims.w/2;
        py    = c.iH - (ly + dims.h/2);
        pw    = dims.w;
        ph    = dims.h;
        depth = lz;
      } else if (rsMmapView === 'top') {
        px    = lx - dims.w/2;
        py    = lz - dims.d/2;
        pw    = dims.w;
        ph    = dims.d;
        depth = ly;
      } else {
        px    = lz - dims.d/2;
        py    = c.iH - (ly + dims.h/2);
        pw    = dims.d;
        ph    = dims.h;
        depth = lx;
      }

      // sliceDepth=0이면 전체 표시 (필터 없음)
      if (sliceDepth > 0 && depth > sliceDepth) return;

      const distRatio = sliceDepth > 0 ? (sliceDepth - depth) / sliceDepth : 0;
      const alpha     = Math.max(0.25, 1 - distRatio * 0.65);

      const cx = offX + px * scale;
      const cy = offY + py * scale;
      const cw = Math.max(1, pw * scale);
      const ch = Math.max(1, ph * scale);

      ctx.globalAlpha = alpha;
      ctx.fillStyle   = p.color;
      ctx.fillRect(cx, cy, cw, ch);
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 0.5;
      ctx.strokeRect(cx, cy, cw, ch);
      ctx.globalAlpha = 1;
  });


}

// 초기화 및 리사이즈
window.addEventListener('resize', rsDrawMinimap);

// ═══════════════════════════════════════════════════════════════
// ── PDF 출력 ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

function openPdfPreview() {
  const modal = document.getElementById('pdfModal');
  modal.style.display = 'flex';
  // Three.js 캔버스는 preserveDrawingBuffer가 false면 캡처 불가 → renderer에서 직접 render 후 캡처
  let canvas3dImg = null;
  try {
    // renderer가 있으면 한 프레임 강제 렌더 후 캡처
    if (typeof renderer !== 'undefined' && renderer) {
      renderer.render(scene, camera);
      canvas3dImg = document.getElementById('canvas3d').toDataURL('image/png');
    }
  } catch(e) { canvas3dImg = null; }
  _buildPdfContent(canvas3dImg);
}

function closePdfPreview() {
  document.getElementById('pdfModal').style.display = 'none';
}

function printPdf() {
  // pdfPrintArea를 body에 복제 후 인쇄
  const src = document.getElementById('pdfPreviewPage').innerHTML;
  let area = document.getElementById('pdfPrintArea');
  if (!area) {
    area = document.createElement('div');
    area.id = 'pdfPrintArea';
    document.body.appendChild(area);
  }
  area.innerHTML = src;
  window.print();
}

function _buildPdfContent(canvas3dImg) {
  const c = CONTAINERS[state.containerType];
  const now = new Date();
  const dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
  const timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

  // ── 전체 통계 ────────────────────────────────────────────────
  const totalPlaced = state.containers.reduce((s, ct) => s + ct.placedParts.length, 0);
  const totalVol = c.iW * c.iH * c.iD * state.containers.length;
  const usedVol = state.containers.reduce((t, ct) =>
    t + ct.placedParts.reduce((s, pp) => {
      const p = PARTS_DEF.find(x => x.code === pp.code);
      if (!p) return s;
      const dims = getOrientedDims(p, pp.orient || 'flat');
      return s + dims.w * dims.h * dims.d;
    }, 0), 0);
  const volPct = totalVol > 0 ? (usedVol / totalVol * 100).toFixed(1) : '0.0';
  const totalTarget = PARTS_DEF.reduce((s, p) => {
    const t = state.userQty?.[p.code] ?? state.containers[0]?.userQty?.[p.code] ?? 0;
    return s + t;
  }, 0);
  const placePct = totalTarget > 0 ? Math.round(totalPlaced / totalTarget * 100) : 0;

  // ── 부품별 집계 ──────────────────────────────────────────────
  const partSummary = PARTS_DEF.map(p => {
    const perCt = state.containers.map(ct =>
      ct.placedParts.filter(pp => pp.code === p.code).length
    );
    const placed = perCt.reduce((s, n) => s + n, 0);
    const target = state.userQty?.[p.code] ?? state.containers[0]?.userQty?.[p.code] ?? 0;
    return { ...p, placed, target, perCt };
  }).filter(p => p.target > 0 || p.placed > 0);

  // ── 컨테이너별 미니맵 3종 ───────────────────────────────────
  const contMaps = state.containers.map((ct, ci) => {
    return ['side','top','front'].map(view => {
      const cv = document.createElement('canvas');
      cv.width = 480; cv.height = 180;
      _drawMinimapTo(cv, view, c, ci);
      return {
        label: view==='side'?'XY 측면':view==='top'?'XZ 평면':'ZY 정면',
        img: cv.toDataURL('image/png')
      };
    });
  });

  // ── HTML 조립 (A4 세로 794×1123px) ──────────────────────────
  const html = `
  <div style="font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-size:10px;color:#111;line-height:1.5">

    <!-- ① 헤더 -->
    <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:10px;margin-bottom:14px;border-bottom:2.5px solid #1a1a2e">
      <div>
        <div style="font-size:18px;font-weight:900;letter-spacing:.03em;color:#1a1a2e">적재 시뮬레이션 보고서</div>
      </div>
      <div style="text-align:right;font-size:9px;color:#888;font-family:monospace;line-height:1.8">
        <div>출력일시: ${dateStr} ${timeStr}</div>
        <div>적재 한계 높이: <b style="color:#444">${fillHeight} mm</b></div>
        <div>컨테이너 내부 규격: <b style="color:#444">${c.iW} × ${c.iH} × ${c.iD} mm</b></div>
      </div>
    </div>

    <!-- ② 요약 지표 4종 -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
      ${[
        { k:'컨테이너 수',  v: state.containers.length+'개',  sub:'', col:'#1d4ed8' },
        { k:'총 배치 부품', v: totalPlaced+'개',              sub:`목표 ${totalTarget}개 중`, col:'#15803d' },
        { k:'배치 달성률',  v: placePct+'%',                  sub:`${totalPlaced}/${totalTarget}`, col: placePct>=100?'#15803d':placePct>=50?'#b45309':'#dc2626' },
        { k:'체적 점유율',  v: volPct+'%',                    sub:'전체 컨테이너 기준', col:'#7c3aed' },
      ].map(s => `
        <div style="border:1px solid #e5e7eb;border-radius:5px;padding:9px 11px;border-left:4px solid ${s.col}">
          <div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">${s.k}</div>
          <div style="font-size:17px;font-weight:800;color:${s.col};font-family:monospace;line-height:1">${s.v}</div>
          ${s.sub ? `<div style="font-size:8px;color:#aaa;margin-top:3px">${s.sub}</div>` : ''}
        </div>`).join('')}
    </div>

    <!-- ③ 부품별 적재 현황 -->
    <div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#333;background:#f3f4f6;padding:5px 8px;border-left:3px solid #1d4ed8;margin-bottom:0">
        부품별 적재 현황
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9.5px">
        <thead>
          <tr style="background:#f9fafb;border-bottom:1px solid #d1d5db">
            <th style="padding:5px 8px;text-align:left;width:28px;font-weight:600;color:#555;white-space:nowrap">코드</th>
            <th style="padding:5px 8px;text-align:left;font-weight:600;color:#555;white-space:nowrap">부품명</th>
            <th style="padding:5px 8px;text-align:left;font-weight:600;color:#555;white-space:nowrap">재질</th>
            <th style="padding:5px 8px;text-align:right;width:36px;font-weight:600;color:#555;white-space:nowrap">목표</th>
            ${state.containers.map((_,ci) => `<th style="padding:5px 8px;text-align:right;width:32px;font-weight:600;color:#1d4ed8;white-space:nowrap">#${ci+1}</th>`).join('')}
            <th style="padding:5px 8px;text-align:right;width:36px;font-weight:600;color:#555;white-space:nowrap">합계</th>
            <th style="padding:5px 8px;text-align:right;width:40px;font-weight:600;color:#555;white-space:nowrap">미배치</th>
            <th style="padding:5px 8px;text-align:left;width:110px;font-weight:600;color:#555;white-space:nowrap">진행률</th>
          </tr>
        </thead>
        <tbody>
          ${partSummary.map((p, i) => {
            const pct = p.target > 0 ? Math.min(100, p.placed / p.target * 100) : (p.placed > 0 ? 100 : 0);
            const rem = Math.max(0, p.target - p.placed);
            const bg = i % 2 === 0 ? '#fff' : '#fafafa';
            return `<tr style="background:${bg};border-bottom:1px solid #f0f0f0">
              <td style="padding:4px 8px;font-weight:800;color:${p.color}">${p.code}</td>
              <td style="padding:4px 8px">${p.name}</td>
              <td style="padding:4px 8px;color:#777;font-size:8.5px">${p.mat}</td>
              <td style="padding:4px 8px;text-align:right;font-family:monospace">${p.target}</td>
              ${p.perCt.map(n => `<td style="padding:4px 8px;text-align:right;font-family:monospace;color:${n>0?'#1d4ed8':'#ccc'}">${n>0?n:'—'}</td>`).join('')}
              <td style="padding:4px 8px;text-align:right;font-family:monospace;font-weight:700">${p.placed}</td>
              <td style="padding:4px 8px;text-align:right;font-family:monospace;color:${rem>0?'#b45309':'#15803d'};font-weight:700">${rem>0?rem+'개':'✓'}</td>
              <td style="padding:4px 8px">
                <div style="display:flex;align-items:center;gap:5px">
                  <div style="flex:1;background:#e5e7eb;border-radius:2px;height:7px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${p.color};border-radius:2px"></div>
                  </div>
                  <span style="font-family:monospace;font-size:8.5px;color:#888;min-width:28px;text-align:right">${Math.round(pct)}%</span>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- ④ 단면 배치도 (컨테이너별) -->
    ${contMaps.map((maps, ci) => `
    <div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#333;background:#f3f4f6;padding:5px 8px;border-left:3px solid #7c3aed;margin-bottom:6px">
        단면 배치도 — #${ci+1} 컨테이너
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
        ${maps.map(m => `
          <div style="border:1px solid #e5e7eb;border-radius:4px;overflow:hidden">
            <div style="background:#1a1a2e;font-size:8px;font-weight:700;text-align:center;padding:3px 0;color:#a5b4fc;letter-spacing:.06em">${m.label}</div>
            <img src="${m.img}" style="width:100%;display:block">
          </div>`).join('')}
      </div>
    </div>`).join('')}

    <!-- ⑤ 3D 적재 현황 뷰 -->
    <div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#333;background:#f3f4f6;padding:5px 8px;border-left:3px solid #15803d;margin-bottom:8px">
        3D 적재 현황
      </div>
      ${canvas3dImg
        ? `<div style="border:1px solid #e5e7eb;border-radius:5px;overflow:hidden;background:#1a1e26">
             <img src="${canvas3dImg}" style="width:100%;display:block;max-height:340px;object-fit:contain;background:#1a1e26">
           </div>`
        : `<div style="border:1px solid #e5e7eb;border-radius:5px;padding:24px;text-align:center;color:#aaa;font-size:10px;background:#fafafa">
             3D 뷰를 캡처할 수 없어요. 뷰어에서 PDF 출력 버튼을 다시 눌러주세요.
           </div>`
      }
    </div>

    <!-- 푸터 -->
    <div style="border-top:1px solid #e5e7eb;padding-top:7px;font-size:8.5px;color:#bbb;display:flex;justify-content:space-between">
<span></span>
      <span>Generated ${dateStr} ${timeStr}</span>
    </div>

  </div>`;

  document.getElementById('pdfPreviewPage').innerHTML = html;
}

// 미니맵을 특정 캔버스에 그리는 독립 함수
function _drawMinimapTo(canvas, view, c, targetCi) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  const PAD = 10;
  let cW, cH;
  if (view === 'side')  { cW = c.iW; cH = c.iH; }
  else if (view === 'top') { cW = c.iW; cH = c.iD; }
  else { cW = c.iD; cH = c.iH; }

  const scale = Math.min((W - PAD*2) / cW, (H - PAD*2) / cH);
  const drawW = cW * scale, drawH = cH * scale;
  const offX = (W - drawW) / 2, offY = (H - drawH) / 2;

  // 컨테이너 외곽선
  ctx.strokeStyle = '#3a4a5a'; ctx.lineWidth = 1.5;
  ctx.strokeRect(offX, offY, drawW, drawH);

  // targetCi가 지정되면 해당 컨테이너만, 없으면 전체
  const containers = targetCi != null
    ? [{ ct: state.containers[targetCi], ci: targetCi }]
    : (state.containers ?? []).map((ct, ci) => ({ ct, ci }));

  containers.forEach(({ ct }) => {
    (ct.placedParts ?? []).forEach(pp => {
      const p = PARTS_DEF.find(x => x.code === pp.code);
      if (!p) return;
      const dims = getOrientedDims(p, pp.orient || 'flat');
      const lx = pp.x + c.iW/2, ly = pp.y, lz = pp.z + c.iD/2;
      let px, py, pw, ph;
      if (view === 'side') {
        px = lx - dims.w/2; py = c.iH - (ly + dims.h/2); pw = dims.w; ph = dims.h;
      } else if (view === 'top') {
        px = lx - dims.w/2; py = lz - dims.d/2; pw = dims.w; ph = dims.d;
      } else {
        px = lz - dims.d/2; py = c.iH - (ly + dims.h/2); pw = dims.d; ph = dims.h;
      }
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = p.color;
      ctx.fillRect(offX + px*scale, offY + py*scale, Math.max(1, pw*scale), Math.max(1, ph*scale));
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.5;
      ctx.strokeRect(offX + px*scale, offY + py*scale, Math.max(1, pw*scale), Math.max(1, ph*scale));
      ctx.globalAlpha = 1;
    });
  });
}
