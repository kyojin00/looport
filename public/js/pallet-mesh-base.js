// pallet-mesh-base.js — 재질 헬퍼, 프레임/링/기초 빌드 함수

function mobTab(tab) {
  const left  = document.querySelector('.left-panel');
  const right = document.querySelector('.right-panel');
  const tabs  = document.querySelectorAll('.mob-tab');
  tabs.forEach(t => t.classList.remove('active'));
  document.getElementById('tab-'+tab)?.classList.add('active');

  if (tab === 'view') {
    left.classList.remove('mob-open');
    right.classList.remove('mob-open');
  } else if (tab === 'pallet' || tab === 'box') {
    left.classList.add('mob-open');
    right.classList.remove('mob-open');
    // 해당 섹션으로 스크롤
    const sections = left.querySelectorAll('.panel-section');
    if (tab === 'pallet') sections[0]?.scrollIntoView({behavior:'smooth'});
    if (tab === 'box')    sections[2]?.scrollIntoView({behavior:'smooth'});
  } else if (tab === 'info') {
    right.classList.add('mob-open');
    left.classList.remove('mob-open');
  }
  // 패널 열고 닫을 때 canvas 재조정
  requestAnimationFrame(resize);
}


canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const allMeshes = [];
  scene.traverse(obj => {
    if (obj.isMesh && obj.userData.type) allMeshes.push(obj);
  });
  const hits = raycaster.intersectObjects(allMeshes);
  if (hits.length > 0) {
    const obj = hits[0].object;
    if (obj.userData.type === 'box') {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
      tooltip.style.top = (e.clientY - rect.top - 40) + 'px';
      tooltip.innerHTML = `📦 ${obj.userData.label}<br>크기: ${obj.userData.ww}×${obj.userData.dd}×${obj.userData.hh} mm<br>무게: ${obj.userData.weight} kg`;
    } else if (obj.userData.type === 'pallet') {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
      tooltip.style.top = (e.clientY - rect.top - 40) + 'px';
      const p = pallets.find(p => p.id === obj.userData.palletId);
      if (p) tooltip.innerHTML = `🔩 ${p.name}<br>${p.w}×${p.d}×${p.h} mm<br>자체: ${p.selfWeight}kg / 최대: ${p.maxLoad}kg`;
    } else {
      tooltip.style.display = 'none';
    }
  } else {
    tooltip.style.display = 'none';
  }
});



function createMetalMaterial(color, roughness = 0.35, metalness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function buildButterflyFrame(group, W, R, bW, mat, pid, cY, cZ) {
  // 이미지의 각 열 프레임: 좌 옥타홈 + 중앙 잘록 연결 + 우 옥타홈이 하나로 이어진 형태
  // 좌/우 슬롯 중심 X
  const lx = -W/4, rx = W/4;
  const outerR = R * 1.22;

  function bar(geoArgs, x, y, rz) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...geoArgs), mat);
    m.position.set(x, y, cZ);
    if (rz) m.rotation.z = rz;
    m.userData = { type:'pallet', palletId:pid };
    m.castShadow = true;
    group.add(m);
  }

  // 좌 옥타곤 링
  buildSingleOctaRing(group, lx, cY, cZ, outerR, bW, mat, pid);
  // 우 옥타곤 링
  buildSingleOctaRing(group, rx, cY, cZ, outerR, bW, mat, pid);

  // 중앙 연결: 위/아래 잘록 연결 빔 (두 링 안쪽 모서리 사이)
  const gap = W/2 - outerR * 0.92 * 2; // 두 링 사이 간격
  const innerW = Math.max(20, W/2 - outerR*1.85);
  // 위 연결
  bar([innerW, bW, bW], 0, cY + outerR*0.92);
  // 아래 연결
  bar([innerW, bW, bW], 0, cY - outerR*0.92);

  // 외곽 좌/우 끝 수직 빔 (사이드 패널)
  [lx - outerR*0.92, rx + outerR*0.92].forEach(ex => {
    bar([bW, outerR*2.0, bW], ex, cY);
  });
}

function buildSingleOctaRing(group, cx, cy, cz, R, bW, mat, pid) {
  // XY 평면 옥타곤 링 (한 슬롯)
  const st  = R * 0.95;   // 직선 변
  const dL  = R * 0.72;   // 대각 변
  const dO  = R * 0.68;   // 대각 오프셋

  function b(w, h, ox, oy, rz) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, bW), mat);
    m.position.set(cx+ox, cy+oy, cz);
    if (rz) m.rotation.z = rz;
    m.userData = { type:'pallet', palletId:pid };
    m.castShadow = true;
    group.add(m);
  }

  b(st,  bW,  0,       R*0.92);   // 위
  b(st,  bW,  0,      -R*0.92);   // 아래
  b(bW,  st,  R*0.92,  0);        // 우
  b(bW,  st, -R*0.92,  0);        // 좌
  b(dL,  bW, -dO,  dO,  Math.PI/4);   // 좌상
  b(dL,  bW,  dO,  dO, -Math.PI/4);   // 우상
  b(dL,  bW, -dO, -dO, -Math.PI/4);   // 좌하
  b(dL,  bW,  dO, -dO,  Math.PI/4);   // 우하
}

function addOctaRingXY(group, R, bW, mat, pid, cx, cy, cz) {
  // XY 평면에 세워진 옥타곤 링 (드럼통 단면을 감싸는 8각 홀더)
  const outerR = R * 1.25;
  const straight = outerR * 1.0;   // 직선 변 길이
  const diagL    = outerR * 0.78;  // 대각 변 길이
  const dOff     = outerR * 0.70;  // 대각 위치 오프셋

  function bar(geo, ox, oy, rz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx + ox, cy + oy, cz);
    if (rz) m.rotation.z = rz;
    m.userData = { type:'pallet', palletId:pid };
    m.castShadow = true;
    group.add(m);
  }

  // 상/하 수평 빔
  bar(new THREE.BoxGeometry(straight, bW, bW),  0,  outerR * 0.92);
  bar(new THREE.BoxGeometry(straight, bW, bW),  0, -outerR * 0.92);
  // 좌/우 수직 빔
  bar(new THREE.BoxGeometry(bW, straight, bW),  outerR * 0.92, 0);
  bar(new THREE.BoxGeometry(bW, straight, bW), -outerR * 0.92, 0);
  // 4 모서리 대각 빔
  bar(new THREE.BoxGeometry(diagL, bW, bW), -dOff,  dOff,  Math.PI/4);
  bar(new THREE.BoxGeometry(diagL, bW, bW),  dOff,  dOff, -Math.PI/4);
  bar(new THREE.BoxGeometry(diagL, bW, bW), -dOff, -dOff, -Math.PI/4);
  bar(new THREE.BoxGeometry(diagL, bW, bW),  dOff, -dOff,  Math.PI/4);
}

function buildXYOctaRing(group, drumR, fT, mat, pid, cx, cy, cz) {
  // XY 평면에 세워진 옥타곤 링 (드럼통이 Z방향으로 눕혀있으므로 앞면에서 보면 원형)
  const R = drumR * 1.28;
  const bW = fT;        // 바 두께
  const straight = R * 1.0; // 직선 변 길이
  const diagL = R * 0.75;

  // 상/하 수평 빔
  [[0, R*0.92], [0, -R*0.92]].forEach(([ox, oy]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(straight, bW, bW), mat);
    m.position.set(cx + ox, cy + oy, cz);
    m.userData = { type:'pallet', palletId:pid }; m.castShadow = true;
    group.add(m);
  });
  // 좌/우 수직 빔
  [[R*0.92, 0], [-R*0.92, 0]].forEach(([ox, oy]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bW, straight, bW), mat);
    m.position.set(cx + ox, cy + oy, cz);
    m.userData = { type:'pallet', palletId:pid }; m.castShadow = true;
    group.add(m);
  });
  // 4 모서리 대각 빔
  const dOff = R * 0.68;
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(diagL, bW, bW), mat);
    m.position.set(cx + sx*dOff, cy + sy*dOff, cz);
    m.rotation.z = Math.PI/4 * sy;
    m.userData = { type:'pallet', palletId:pid }; m.castShadow = true;
    group.add(m);
  });
}

function buildSideOctaRing(group, drumR, fT, frameMat, blueMat, pid, cx, cy, cz) {
  // 옆으로 눕힌 드럼을 잡는 옥타곤 링 (XY 평면)
  const R = drumR + fT * 0.6;
  const cut = R * 0.41; // 45도 변 길이
  const straight = R * Math.sqrt(2) * 0.55;

  // 수평 빔 (위/아래)
  [cy + R*0.9, cy - R*0.9].forEach(ry => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(straight, fT, fT), frameMat);
    m.position.set(cx, ry, cz);
    m.userData = { type:'pallet', palletId:pid }; m.castShadow = true;
    group.add(m);
  });
  // 수직 빔 (좌/우)
  [cx + R*0.9, cx - R*0.9].forEach(rx => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(fT, straight, fT), frameMat);
    m.position.set(rx, cy, cz);
    m.userData = { type:'pallet', palletId:pid }; m.castShadow = true;
    group.add(m);
  });
  // 4 모서리 대각
  const dOff = R * 0.65;
  const diagL = cut * 1.3;
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(diagL, fT, fT), frameMat);
    m.position.set(cx + sx*dOff, cy + sy*dOff, cz);
    m.rotation.z = Math.PI/4;
    m.userData = { type:'pallet', palletId:pid }; m.castShadow = true;
    group.add(m);
  });
}

function buildDrumOctaFrame(group, sW, sD, fT, frameMat, blueMat, pid, baseH, cx, cz, frameH) {
  // 각 드럼 슬롯의 옥타곤 홀더: 상단 + 하단 2개 링
  const levels = [baseH + frameH*0.15, baseH + frameH*0.75];
  levels.forEach(yPos => {
    const cut = sW * 0.22;
    // 수평 상하
    [-(frameH*0.5 - fT/2)*0, (frameH*0.0)].forEach(() => {
      // 좌우 직선
      const mH = new THREE.Mesh(new THREE.BoxGeometry(sW - cut*2, fT, fT), frameMat);
      mH.position.set(cx, yPos, cz);
      mH.userData = { type:'pallet', palletId:pid }; mH.castShadow=true;
      group.add(mH);
      // 상하 직선
      const mV = new THREE.Mesh(new THREE.BoxGeometry(fT, fT, sD - cut*2), frameMat);
      mV.position.set(cx, yPos, cz);
      mV.userData = { type:'pallet', palletId:pid }; mV.castShadow=true;
      group.add(mV);
      // 4 모서리 대각
      const diagL = cut * Math.sqrt(2) * 1.05;
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz]) => {
        const md = new THREE.Mesh(new THREE.BoxGeometry(diagL, fT, fT), frameMat);
        md.position.set(cx + sx*(sW/2 - cut/2), yPos, cz + sz*(sD/2 - cut/2));
        md.rotation.y = Math.PI/4;
        md.userData = { type:'pallet', palletId:pid }; md.castShadow=true;
        group.add(md);
      });
    });
  });

  // 수직 연결 빔 (파란색) — 상하 링 연결
  const connH = frameH * 0.6;
  const connY = baseH + frameH * 0.15 + connH/2;
  [[-sW/2+fT/2, -sD/2+fT/2],[sW/2-fT/2,-sD/2+fT/2],
   [-sW/2+fT/2,  sD/2-fT/2],[sW/2-fT/2, sD/2-fT/2]].forEach(([ox,oz]) => {
    const mc = new THREE.Mesh(new THREE.BoxGeometry(fT*0.7, connH, fT*0.7), blueMat);
    mc.position.set(cx+ox, connY, cz+oz);
    mc.userData = { type:'pallet', palletId:pid }; mc.castShadow=true;
    group.add(mc);
  });
}

function buildOctagonFrame(group, W, H, fW, mat, pid, yPos, zPos) {
  // 8각형 외곽 프레임: 직선 4변 + 모서리 4개(45도 회전)
  const cut = W * 0.18; // 모서리 컷 길이
  const segments = [
    // [가로길이, 세로길이, x오프셋, 회전Y]
    { w: W - cut*2, x: 0,         z: 0,          ry: 0 },          // 앞 중앙 (실제론 옥타곤이라 불필요, 여기선 외곽 링으로 표현)
  ];

  // 상하 수평 빔
  [-(H/2 - fW/2), (H/2 - fW/2)].forEach(dy => {
    const m = addPalletMesh(group, new THREE.BoxGeometry(W - cut*2, fW, fW), mat, pid, yPos + dy);
    m.position.z = zPos;
  });
  // 좌우 수직 빔
  [-(W/2 - fW/2), (W/2 - fW/2)].forEach(dx => {
    const m = addPalletMesh(group, new THREE.BoxGeometry(fW, H - cut*2, fW), mat, pid, yPos);
    m.position.x = dx; m.position.z = zPos;
  });
  // 4 모서리 대각 빔
  const diagL = Math.sqrt(2) * cut;
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy]) => {
    const m = addPalletMesh(group, new THREE.BoxGeometry(fW, diagL, fW), mat, pid, yPos + sy*(H/2 - cut/2));
    m.position.x = sx*(W/2 - cut/2); m.position.z = zPos;
    m.rotation.z = Math.PI/4 * sx * sy;
  });
}

function addPalletMesh(group, geo, mat, pid, y) {
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.castShadow = true; m.receiveShadow = true;
  m.userData = { type: 'pallet', palletId: pid };
  group.add(m);
  return m;
}

function buildBasePallet(group, W, D, H, mat, beamMat, pid) {
  const beamH = H * 0.4, deckH = H * 0.18, gap = 20;
  // Top planks
  const plankCount = 7, plankW = (W - gap*(plankCount-1)) / plankCount;
  for (let i = 0; i < plankCount; i++) {
    const m = addPalletMesh(group, new THREE.BoxGeometry(plankW, deckH, D), mat, pid, H - deckH/2);
    m.position.x = -W/2 + plankW/2 + i*(plankW+gap);
  }
  // Bottom planks
  const bCount = 3, bW = (W - gap*2) / bCount;
  for (let i = 0; i < bCount; i++) {
    const m = addPalletMesh(group, new THREE.BoxGeometry(bW, deckH, D), mat, pid, deckH/2);
    m.position.x = -W/2 + bW/2 + i*(bW+gap);
  }
  // 4-Way beams (2 dirs)
  [-D/2+80, 0, D/2-80].forEach(z => {
    const m = addPalletMesh(group, new THREE.BoxGeometry(W, beamH, 80), beamMat, pid, deckH + beamH/2);
    m.position.z = z;
  });
  [-W/2+80, 0, W/2-80].forEach(x => {
    const m = addPalletMesh(group, new THREE.BoxGeometry(80, beamH, D), beamMat, pid, deckH + beamH/2);
    m.position.x = x;
  });
}
