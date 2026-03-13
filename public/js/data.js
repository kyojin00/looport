// ─── PARTS MASTER DATA ────────────────────────────────────────
const MAX_QTY = 9999;

const PARTS_DEF = [
  { code:'A',  name:'베이스판',            w:2270, h:120, d:1440, mat:'SPHC 강판',        color:'#4a9eff' },
  { code:'B',  name:'엔진브라켓',          w:389,  h:160, d:248,  mat:'SS400',             color:'#ff6b35' },
  { code:'C2', name:'장변 (케이스) 80ea',  w:1680, h:930, d:2310, mat:'20×20×1.4T 40EA',  color:'#4ade80'  },
  { code:'E2', name:'측변 (케이스) 80ea',  w:1440, h:930, d:1640, mat:'20×20×1.4T 40EA',  color:'#fbbf24'  },
  { code:'G',  name:'누름바 120ea',       w:1440, h:520,  d:1390,   mat:'플랫바',            color:'#ec4899'  },
];

const CONTAINERS = {
  ST: { label:'ST (표준형)',   spec:'11,900×2,300×2,280', iW:11900, iH:2580, iD:2300 },
  HC: { label:'HC (하이큐브)', spec:'12,030×2,350×2,580', iW:12030, iH:2580, iD:2350 },
};

// ─── STATE ────────────────────────────────────────────────────
const STATE_KEY = 'sim_state_v8';

function defaultContainerState() {
  return { placedParts: [] };
}

function defaultState() {
  const userQty = {}, userOrient = {}, userMaxLayer = {};
  PARTS_DEF.forEach(p => {
    userQty[p.code] = 0;
    userOrient[p.code] = 'flat';
    userMaxLayer[p.code] = 0;
  });
  return { containerType: 'ST', containers: [defaultContainerState()], userQty, userOrient, userMaxLayer };
}

function loadState() {
  try {
    const OLD_KEYS = ['sim_state_v7', 'sim_state_v6', 'sim_state_v5', 'sim_state_v4'];
    let raw = localStorage.getItem(STATE_KEY);
    if (!raw) {
      for (const oldKey of OLD_KEYS) { raw = localStorage.getItem(oldKey); if (raw) break; }
    }
    if (!raw) return defaultState();

    const s = JSON.parse(raw);
    if (!s.containers) return defaultState();

    if (!s.userQty || !s.userOrient) {
      s.userQty = {}; s.userOrient = {};
      const src = s.containers[0];
      PARTS_DEF.forEach(p => {
        s.userQty[p.code]    = src?.userQty?.[p.code]    ?? 0;
        s.userOrient[p.code] = src?.userOrient?.[p.code] ?? 'flat';
      });
    }

    if (!s.userMaxLayer) s.userMaxLayer = {};
    PARTS_DEF.forEach(p => {
      if (s.userQty[p.code]      === undefined) s.userQty[p.code]      = 0;
      if (s.userOrient[p.code]   === undefined) s.userOrient[p.code]   = 'flat';
      if (s.userMaxLayer[p.code] === undefined) s.userMaxLayer[p.code] = 0;
    });

    // 삭제된 부품 코드 정리
    const validCodes = new Set(PARTS_DEF.map(p => p.code));
    s.containers.forEach(ct => {
      if (!ct.placedParts) ct.placedParts = [];
      ct.placedParts = ct.placedParts.filter(pp => validCodes.has(pp.code));
      delete ct.userQty;
      delete ct.userOrient;
    });
    Object.keys(s.userQty).forEach(code => { if (!validCodes.has(code)) delete s.userQty[code]; });
    return s;
  } catch { return defaultState(); }
}

function saveState(state) { localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
function resetState() { localStorage.removeItem(STATE_KEY); }

// ─── ORIENTATION ─────────────────────────────────────────────
const ORIENTATIONS = {
  flat:      { label:'눕히기',     icon:'▭', fn: (w,h,d) => ({ w:w, h:h, d:d }) },
  flat_rot:  { label:'눕히기 90°', icon:'▬', fn: (w,h,d) => ({ w:d, h:h, d:w }) },
  stand:     { label:'세우기',     icon:'▯', fn: (w,h,d) => ({ w:w, h:d, d:h }) },
  stand_rot: { label:'세우기 90°', icon:'▮', fn: (w,h,d) => ({ w:d, h:w, d:h }) },
  side:      { label:'옆으로',     icon:'◫', fn: (w,h,d) => ({ w:h, h:w, d:d }) },
  side_rot:  { label:'옆으로 90°', icon:'⬚', fn: (w,h,d) => ({ w:h, h:d, d:w }) },
};

function getOrientedDims(p, orient) {
  const o = ORIENTATIONS[orient] || ORIENTATIONS.flat;
  return o.fn(p.w, p.h, p.d);
}

function getCt(state, idx) { return state.containers[idx]; }