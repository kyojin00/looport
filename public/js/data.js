// ─── PARTS MASTER DATA ────────────────────────────────────────
const MAX_QTY = 9999;

const PARTS_DEF = [
  { code:'A', name:'베이스판',   w:2270, h:120, d:1440, mat:'SPHC 강판',     color:'#4a9eff' },
  { code:'B', name:'엔진브라켓', w:389,  h:160, d:248,  mat:'SS400',          color:'#ff6b35' },
  { code:'C', name:'장변',            w:2270, h:20,  d:800,  mat:'20×20×1.4T',    color:'#22c55e' },
  { code:'E', name:'측변',            w:1440, h:20,  d:800,  mat:'20×20×1.4T',    color:'#f59e0b' },
  { code:'C2', name:'장변 (케이스)',  w:2350, h:2270,  d:900,  mat:'20×20×1.4T 91EA',    color:'#4ade80',  },
  { code:'E2', name:'측변 (케이스)',  w:1600, h:2270,  d:900,  mat:'20×20×1.4T 41EA',    color:'#fbbf24' },
  { code:'F', name:'간지바',     w:1650, h:70,  d:70,   mat:'1.4T 강판 성형', color:'#06b6d4' },
  { code:'G', name:'누름바',     w:2208, h:10,  d:40,   mat:'플랫바',         color:'#ec4899' },
  { code:'H', name:'코너',       w:100,  h:80,  d:80,   mat:'SS400',          color:'#84cc16' },
  { code:'I', name:'장각관',     w:1440, h:30,  d:70,   mat:'각관',            color:'#f97316', setQty:5  },
  { code:'J', name:'측각관',     w:2270, h:20,  d:40,   mat:'각관',            color:'#14b8a6', setQty:2  },
  { code:'K', name:'소각관',     w:2270, h:30,  d:30,   mat:'각관',            color:'#e879f9', setQty:7  },
];

const CONTAINERS = {
  ST: { label:'ST (표준형)',   spec:'11,900×2,300×2,580', iW:11900, iH:2580, iD:2300 },
  HC: { label:'HC (하이큐브)', spec:'12,030×2,350×2,580', iW:12030, iH:2580, iD:2350 },
};


// ─── STATE ────────────────────────────────────────────────────
const STATE_KEY = 'sim_state_v7'; // v7: userQty/userOrient 전역 공유

function defaultContainerState() {
  return { placedParts: [] };
}

function defaultState() {
  const userQty = {};
  const userOrient = {};
  PARTS_DEF.forEach(p => { userQty[p.code] = 0; userOrient[p.code] = 'flat'; });
  return {
    containerType: 'ST',
    containers: [defaultContainerState()],
    userQty,
    userOrient,
  };
}

function loadState() {
  try {
    // 현재 key 먼저, 없으면 구버전 key에서 마이그레이션
    const OLD_KEYS = ['sim_state_v6', 'sim_state_v5', 'sim_state_v4'];
    let raw = localStorage.getItem(STATE_KEY);
    if (!raw) {
      for (const oldKey of OLD_KEYS) {
        raw = localStorage.getItem(oldKey);
        if (raw) break;
      }
    }
    if (!raw) return defaultState();

    const s = JSON.parse(raw);
    if (!s.containers) return defaultState();

    // 구버전: userQty/userOrient가 최상위에 없으면 첫 컨테이너에서 마이그레이션
    if (!s.userQty || !s.userOrient) {
      s.userQty = {};
      s.userOrient = {};
      const src = s.containers[0];
      PARTS_DEF.forEach(p => {
        s.userQty[p.code]    = src?.userQty?.[p.code]    ?? 0;
        s.userOrient[p.code] = src?.userOrient?.[p.code] ?? 'flat';
      });
    }

    // 신규 부품 코드 누락분 채우기
    PARTS_DEF.forEach(p => {
      if (s.userQty[p.code]    === undefined) s.userQty[p.code]    = 0;
      if (s.userOrient[p.code] === undefined) s.userOrient[p.code] = 'flat';
    });

    s.containers.forEach(ct => {
      if (!ct.placedParts) ct.placedParts = [];
      // D(Half Door) 배치 데이터 마이그레이션 제거
      ct.placedParts = ct.placedParts.filter(pp => pp.code !== 'D');
      delete ct.userQty;
      delete ct.userOrient;
    });
    // 전역 userQty에서 D 제거
    if (s.userQty) delete s.userQty['D'];
    return s;
  } catch { return defaultState(); }
}

function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function resetState() {
  localStorage.removeItem(STATE_KEY);
}

// ─── ORIENTATION ─────────────────────────────────────────────
const ORIENTATIONS = {
  flat:     { label:'눕히기',       icon:'▭', fn: (w,h,d) => ({ w:w, h:h, d:d }) },
  flat_rot: { label:'눕히기 90°',   icon:'▬', fn: (w,h,d) => ({ w:d, h:h, d:w }) },
  stand:    { label:'세우기',       icon:'▯', fn: (w,h,d) => ({ w:w, h:d, d:h }) },
  stand_rot:{ label:'세우기 90°',   icon:'▮', fn: (w,h,d) => ({ w:d, h:w, d:h }) },
  side:     { label:'옆으로',       icon:'◫', fn: (w,h,d) => ({ w:h, h:w, d:d }) },
  side_rot: { label:'옆으로 90°',   icon:'⬚', fn: (w,h,d) => ({ w:h, h:d, d:w }) },
};

function getOrientedDims(p, orient) {
  const o = ORIENTATIONS[orient] || ORIENTATIONS.flat;
  return o.fn(p.w, p.h, p.d);
}

function getCt(state, idx) {
  return state.containers[idx];
}