'use strict';

/* ============================================================
   내 옷사이즈 — app.js
   Part A: data model, profile storage, size-chart parsing,
           recommendation engine
   ============================================================ */

const LS = {
  profile: 'sizefit.profile.v1',
  rows: 'sizefit.rows.v1',        // 옛 단일 표 키 — 지우지 않고 지금 표를 그대로 비춰 둔다
  charts: 'sizefit.charts.v2',    // 새 보관함(여러 벌)
  tab: 'sizefit.tab.v1',
  category: 'sizefit.category.v1',
};

const APP_ID = 'size-fit';
const SCHEMA_VERSION = 2;
const DEFAULT_CHART_NAME = '기본 표';

/* ---------- 나의 기준 ---------- */
const DEFAULT_PROFILE = {
  height: 186,
  weight: 73,
  waistInch: 32.5,
  topSize: '2XL (110)',
  measure: {
    shoulder: 51,     // 어깨너비
    chest: 59.5,      // 가슴단면
    sleeve: 65.5,     // 소매 (어깨선~소매끝)
    sleeveCb: 87,     // 화장 (등 중앙~소매끝)
    length: 74,       // 상의 총장
    neck: 40.5,       // 목둘레
    hip: 52,          // 힙단면
    thigh: 32.5,      // 허벅지단면
    rise: 29,         // 밑위
    outseam: 106,     // 아웃심(바지 총장)
    inseam: 77,       // 인심
    hem: 18.5,        // 밑단
    footLength: 265,  // 발길이 (mm)
    footWidth: 100,   // 발볼 (mm)
  },
};

const MEASURES = {
  shoulder: { label: '어깨', full: '어깨너비', unit: 'cm', kind: 'width' },
  chest:    { label: '가슴단면', unit: 'cm', kind: 'width' },
  length:   { label: '총장', unit: 'cm', kind: 'length' },
  sleeve:   { label: '소매', unit: 'cm', kind: 'length' },
  sleeveCb: { label: '화장', full: '화장(등중앙~소매끝)', unit: 'cm', kind: 'length' },
  neck:     { label: '목둘레', unit: 'cm', kind: 'width' },
  waist:    { label: '허리단면', unit: 'cm', kind: 'width' },
  hip:      { label: '힙단면', unit: 'cm', kind: 'width' },
  thigh:    { label: '허벅지단면', unit: 'cm', kind: 'width' },
  rise:     { label: '밑위', unit: 'cm', kind: 'length' },
  outseam:  { label: '아웃심', unit: 'cm', kind: 'length' },
  inseam:   { label: '인심', unit: 'cm', kind: 'length' },
  hem:      { label: '밑단', unit: 'cm', kind: 'width' },
  footLength: { label: '발길이', full: '발길이(실측)', unit: 'mm', kind: 'length' },
  footWidth:  { label: '발볼', full: '발볼(볼넓이)', unit: 'mm', kind: 'width' },
};

const MEASURE_ORDER = [
  'shoulder', 'chest', 'length', 'sleeve', 'sleeveCb', 'neck',
  'waist', 'hip', 'thigh', 'rise', 'outseam', 'inseam', 'hem',
  'footLength', 'footWidth',
];

const CATEGORIES = {
  top: {
    name: '상의',
    sub: '티셔츠 · 맨투맨 · 니트',
    measures: ['shoulder', 'chest', 'length', 'sleeve'],
    weights: { shoulder: 1.2, chest: 1.0, length: 1.35, sleeve: 1.2 },
    adj: {},
    critical: ['length', 'shoulder'],
  },
  outer: {
    name: '아우터',
    sub: '자켓 · 코트 · 점퍼',
    measures: ['shoulder', 'chest', 'length', 'sleeve'],
    weights: { shoulder: 1.0, chest: 1.0, length: 1.15, sleeve: 1.05 },
    adj: { shoulder: [0, 1.5], chest: [2.5, 4.5], length: [0, 2.5], sleeve: [0, 1] },
    critical: ['length', 'chest'],
  },
  shirt: {
    name: '정장셔츠',
    sub: '드레스셔츠 · 슬림핏 셔츠',
    measures: ['shoulder', 'chest', 'sleeve', 'length', 'neck'],
    weights: { shoulder: 1.0, chest: 1.0, sleeve: 1.25, sleeveCb: 1.25, length: 1.0, neck: 0.9 },
    adj: { chest: [0, 1], length: [4, 6] },
    critical: ['sleeve', 'neck'],
  },
  bottom: {
    name: '하의',
    sub: '바지 · 데님 · 슬랙스',
    measures: ['waist', 'hip', 'outseam', 'thigh', 'rise', 'hem'],
    weights: { waist: 1.4, hip: 0.9, outseam: 1.35, inseam: 0.8, thigh: 0.8, rise: 0.7, hem: 0.4 },
    adj: {},
    critical: ['waist', 'outseam'],
  },
  shoe: {
    name: '신발',
    sub: '스니커즈 · 구두 · 부츠',
    measures: ['footLength', 'footWidth'],
    weights: { footLength: 1.6, footWidth: 1.0 },
    adj: {},
    critical: ['footLength'],
  },
};

const TOLERANCE = {
  shoulder: 1.5, chest: 1.8, length: 1.5, sleeve: 1.2, sleeveCb: 1.2, neck: 0.6,
  waist: 1.2, hip: 2.0, thigh: 1.2, rise: 1.5, outseam: 1.5, inseam: 1.5, hem: 1.2,
  footLength: 5, footWidth: 4,   // mm
};

const VERDICT = [
  { min: 90, text: '딱 맞는 핏' },
  { min: 80, text: '잘 맞는 핏' },
  { min: 68, text: '무난한 핏' },
  { min: 50, text: '조정이 필요한 핏' },
  { min: 0, text: '맞지 않아요' },
];

/* ---------- 1클릭 샘플 ---------- */
const PRESETS = [
  {
    id: 'sweat', category: 'top', name: '오버핏 맨투맨',
    rows: [
      { size: 'M', values: { shoulder: 46, chest: 54, length: 68, sleeve: 59 } },
      { size: 'L', values: { shoulder: 48, chest: 56, length: 70, sleeve: 61 } },
      { size: 'XL', values: { shoulder: 50, chest: 58, length: 72, sleeve: 63 } },
      { size: '2XL', values: { shoulder: 52, chest: 60, length: 74, sleeve: 65 } },
    ],
  },
  {
    id: 'tee', category: 'top', name: '반팔 티셔츠',
    rows: [
      { size: 'M', values: { shoulder: 45, chest: 54, length: 70, sleeve: 21 } },
      { size: 'L', values: { shoulder: 47, chest: 57, length: 72, sleeve: 22 } },
      { size: 'XL', values: { shoulder: 49, chest: 60, length: 74, sleeve: 23 } },
      { size: '2XL', values: { shoulder: 51, chest: 63, length: 75, sleeve: 24 } },
    ],
  },
  {
    id: 'jacket', category: 'outer', name: '싱글 자켓',
    rows: [
      { size: 'M', values: { shoulder: 47, chest: 56, length: 70, sleeve: 62 } },
      { size: 'L', values: { shoulder: 49, chest: 59, length: 72, sleeve: 64 } },
      { size: 'XL', values: { shoulder: 51, chest: 62, length: 74, sleeve: 66 } },
      { size: '2XL', values: { shoulder: 53, chest: 65, length: 76, sleeve: 68 } },
    ],
  },
  {
    id: 'dress', category: 'shirt', name: '정장셔츠',
    rows: [
      { size: '100', values: { neck: 39, shoulder: 47, chest: 56, sleeve: 63, sleeveCb: 85, length: 78 } },
      { size: '105', values: { neck: 40, shoulder: 49, chest: 59, sleeve: 64.5, sleeveCb: 86.5, length: 80 } },
      { size: '110', values: { neck: 41, shoulder: 51, chest: 62, sleeve: 66, sleeveCb: 88, length: 82 } },
    ],
  },
  {
    id: 'denim', category: 'bottom', name: '스트레이트 데님',
    rows: [
      { size: '30', values: { waist: 38, hip: 49, outseam: 103, thigh: 29.5, rise: 27, hem: 17 } },
      { size: '32', values: { waist: 41, hip: 51, outseam: 105, thigh: 31, rise: 28, hem: 18 } },
      { size: '34', values: { waist: 43.5, hip: 53, outseam: 107, thigh: 32.5, rise: 29, hem: 19 } },
    ],
  },
  {
    id: 'sneaker', category: 'shoe', name: '스니커즈',
    rows: [
      { size: '255', values: { footLength: 255, footWidth: 96 } },
      { size: '260', values: { footLength: 260, footWidth: 98 } },
      { size: '265', values: { footLength: 265, footWidth: 100 } },
      { size: '270', values: { footLength: 270, footWidth: 101 } },
    ],
  },
];

/* ---------- 유틸 ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

function isNum(v) {
  return typeof v === 'number' && isFinite(v);
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function fmt(v, digits) {
  if (!isNum(v)) return '';
  const r = round1(v);
  if (digits === 0) return String(Math.round(v));
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** 항목별 단위 — 신발은 mm, 나머지는 cm. */
function unitOf(key) {
  const def = MEASURES[key];
  return (def && def.unit) || 'cm';
}

/** 표 머리글처럼 짧게 쓸 때: mm 항목만 단위를 붙인다. */
function measureLabel(key, withUnit) {
  const def = MEASURES[key];
  const label = (def && def.label) || key;
  if (!withUnit || unitOf(key) === 'cm') return label;
  return label + '(' + unitOf(key) + ')';
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function uid() {
  return 'r' + Math.random().toString(36).slice(2, 9);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- 사이즈표 보관함(여러 벌) · 백업 ---------- */
/*
  옛 앱은 'sizefit.rows.v1' 하나에 종류별 표를 담아 두었고, 새 표를 넣으면 덮였다.
  그래서 v2는 '한 벌 = 한 표' 목록으로 보관하고 지금 쓰는 표를 종류별로 기억한다.
  옛 키는 지우지 않고, 지금 보고 있는 표를 그 모양으로 비춰 두어(legacyRowsFromStore)
  예전 화면·캐시된 옛 코드로 돌아가도 쓸 수 있게 한다.
*/

function sanitizeRow(raw) {
  const row = { id: (raw && typeof raw.id === 'string' && raw.id) ? raw.id : uid(), size: '', values: {}, memo: '' };
  if (raw && typeof raw.size === 'string') row.size = raw.size.slice(0, 40);
  if (raw && typeof raw.memo === 'string') row.memo = raw.memo.slice(0, 200);
  if (raw && raw.values && typeof raw.values === 'object') {
    Object.keys(raw.values).forEach(k => {
      if (MEASURES[k] && isNum(raw.values[k])) row.values[k] = raw.values[k];
    });
  }
  return row;
}

function emptyChartStore() {
  const active = {};
  Object.keys(CATEGORIES).forEach(cat => { active[cat] = null; });
  return { schemaVersion: SCHEMA_VERSION, app: APP_ID, charts: [], activeByCategory: active, migratedAt: '' };
}

function sanitizeChart(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const category = (typeof raw.category === 'string' && CATEGORIES[raw.category]) ? raw.category : null;
  if (!category) return null;
  const t = Date.now();
  return {
    id: (typeof raw.id === 'string' && raw.id) ? raw.id : uid(),
    name: (typeof raw.name === 'string' && raw.name.trim()) ? raw.name.trim().slice(0, 40) : DEFAULT_CHART_NAME,
    category: category,
    rows: (Array.isArray(raw.rows) ? raw.rows : []).map(sanitizeRow),
    memo: typeof raw.memo === 'string' ? raw.memo.slice(0, 500) : '',
    createdAt: isNum(raw.createdAt) ? raw.createdAt : t,
    updatedAt: isNum(raw.updatedAt) ? raw.updatedAt : t,
  };
}

/** 종류별로 지금 쓰는 표. */
function activeCharts(store) {
  const out = {};
  const charts = (store && store.charts) || [];
  Object.keys(CATEGORIES).forEach(cat => {
    const id = store && store.activeByCategory ? store.activeByCategory[cat] : null;
    out[cat] = charts.find(c => c.id === id && c.category === cat) || null;
  });
  return out;
}

/** 옛 단일 표(종류별 배열)를 '기본 표' 한 벌씩으로 감싼다. 옛 키는 건드리지 않는다. */
function migrateLegacyRows(legacy, now) {
  const t = now || Date.now();
  const store = emptyChartStore();
  if (!legacy || typeof legacy !== 'object') return store;
  store.migratedAt = new Date(t).toISOString();
  Object.keys(CATEGORIES).forEach(cat => {
    const list = Array.isArray(legacy[cat]) ? legacy[cat] : [];
    const rows = list.map(sanitizeRow).filter(r => r.size || Object.keys(r.values).length);
    if (!rows.length) return;
    const chart = {
      id: uid(), name: DEFAULT_CHART_NAME, category: cat, rows: rows, memo: '',
      createdAt: t, updatedAt: t,
    };
    store.charts.push(chart);
    store.activeByCategory[cat] = chart.id;
  });
  return store;
}

/** 저장해 둔 v2 값을 검사해 안전한 모양으로. 형식이 아니면 null. */
function normalizeChartStore(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.charts)) return null;
  const store = emptyChartStore();
  store.migratedAt = typeof raw.migratedAt === 'string' ? raw.migratedAt : '';
  const seen = {};
  raw.charts.forEach(ch => {
    const clean = sanitizeChart(ch);
    if (!clean) return;
    if (seen[clean.id]) clean.id = uid();
    seen[clean.id] = 1;
    store.charts.push(clean);
  });
  const wanted = (raw.activeByCategory && typeof raw.activeByCategory === 'object') ? raw.activeByCategory : {};
  Object.keys(CATEGORIES).forEach(cat => {
    const hit = store.charts.find(c => c.id === wanted[cat] && c.category === cat);
    const first = store.charts.find(c => c.category === cat);
    store.activeByCategory[cat] = hit ? hit.id : (first ? first.id : null);
  });
  return store;
}

/**
 * 저장소에서 읽은 값 → {store, migrated, persisted}.
 * 새 보관함이 없으면 옛 단일 표에서 옮긴다(옛 키 삭제 없음).
 */
function loadChartStore(legacy, stored, now) {
  const normalized = normalizeChartStore(stored);
  if (normalized) {
    return { store: normalized, migrated: false, needsSave: false };
  }
  const store = migrateLegacyRows(legacy, now);
  return { store: store, migrated: store.charts.length > 0, needsSave: store.charts.length > 0 };
}

/** 옛 앱(단일 표)과 호환되도록 지금 쓰는 표를 옛 키 모양으로도 남긴다. */
function legacyRowsFromStore(store) {
  const active = activeCharts(store);
  const out = {};
  Object.keys(CATEGORIES).forEach(cat => {
    out[cat] = active[cat] ? active[cat].rows.map(r => ({ id: r.id, size: r.size, values: clone(r.values) })) : [];
  });
  return out;
}

/** 백업 파일 한 벌. 앱 이름·저장 구조 버전·내보낸 날짜를 함께 넣는다. */
function buildBackup(store, profile, now) {
  const t = now || new Date();
  return {
    app: APP_ID,
    appName: '내 옷사이즈',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: t.toISOString(),
    profile: clone(profile),
    activeByCategory: clone(store.activeByCategory || {}),
    charts: (store.charts || []).map(ch => ({
      id: ch.id,
      name: ch.name,
      category: ch.category,
      memo: ch.memo || '',
      createdAt: ch.createdAt,
      updatedAt: ch.updatedAt,
      rows: (ch.rows || []).map(r => ({ id: r.id, size: r.size, memo: r.memo || '', values: clone(r.values) })),
    })),
  };
}

/** 백업 파일을 읽어 무엇이 들어 있는지 확인한다. 다른 앱 파일이면 던진다. */
function readBackup(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('JSON 파일을 읽을 수 없어요.');
  if (raw.app && raw.app !== APP_ID) throw new Error('size-fit 백업 파일이 아니에요(앱: ' + String(raw.app) + ').');
  if (!Array.isArray(raw.charts)) throw new Error('사이즈표 목록이 없는 파일이에요.');
  const warnings = [];
  const charts = [];
  const seen = {};
  raw.charts.forEach((ch, i) => {
    const clean = sanitizeChart(ch);
    if (!clean) { warnings.push((i + 1) + '번째 표는 옷 종류를 알 수 없어 건너뛰었어요.'); return; }
    if (typeof ch.id === 'string' && ch.id) clean.id = ch.id;
    if (seen[clean.id]) clean.id = uid();
    seen[clean.id] = 1;
    charts.push(clean);
  });
  const version = isNum(raw.schemaVersion) ? raw.schemaVersion : (isNum(raw.version) ? raw.version : 1);
  if (version > SCHEMA_VERSION) {
    warnings.push('더 새 버전(v' + version + ')에서 만든 파일이라, 읽을 수 있는 항목만 복원합니다.');
  }
  const requested = (raw.activeByCategory && typeof raw.activeByCategory === 'object') ? raw.activeByCategory : {};
  return {
    app: raw.app || APP_ID,
    version: version,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    profile: (raw.profile && typeof raw.profile === 'object') ? raw.profile : null,
    activeByCategory: requested,
    charts: charts,
    warnings: warnings,
  };
}

/**
 * 복원. mode 'merge'(기본)는 지금 표를 그대로 두고 백업의 표를 더하고,
 * 'replace'는 지금 표를 모두 지우고 백업으로 바꾼다(확인은 화면에서 한 번 더).
 */
function mergeChartStores(current, incoming, mode) {
  const t = Date.now();
  const store = (mode === 'replace') ? emptyChartStore() : (normalizeChartStore(clone(current)) || emptyChartStore());
  const base = store.charts;
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const warnings = [];

  (incoming.charts || []).forEach(src => {
    const same = base.find(c => c.id === src.id);
    if (same) {
      if ((src.updatedAt || 0) > (same.updatedAt || 0)) {
        same.name = src.name;
        same.rows = (src.rows || []).map(sanitizeRow);
        same.memo = src.memo || '';
        same.updatedAt = src.updatedAt || t;
        updated += 1;
      } else {
        skipped += 1;
      }
      return;
    }
    let name = src.name || DEFAULT_CHART_NAME;
    if (base.some(c => c.category === src.category && c.name === name)) {
      let n = 2;
      while (base.some(c => c.category === src.category && c.name === name + ' (' + n + ')')) n += 1;
      name = name + ' (' + n + ')';
      warnings.push('같은 이름의 표가 있어 “' + name + '”로 넣었어요.');
    }
    base.push({
      id: base.some(c => c.id === src.id) ? uid() : src.id,
      name: name,
      category: src.category,
      rows: (src.rows || []).map(sanitizeRow),
      memo: src.memo || '',
      createdAt: src.createdAt || t,
      updatedAt: src.updatedAt || t,
    });
    added += 1;
  });

  const wanted = (incoming.activeByCategory && typeof incoming.activeByCategory === 'object') ? incoming.activeByCategory : {};
  const replaceMode = mode === 'replace';
  Object.keys(CATEGORIES).forEach(cat => {
    const preferred = base.find(c => c.id === wanted[cat] && c.category === cat);
    const currentPick = base.find(c => c.id === store.activeByCategory[cat] && c.category === cat);
    const first = base.find(c => c.category === cat);
    // 합치기에서는 사용자가 보고 있던 표를 그대로 두고, 덮어쓰기에서만 백업의 표를 고른다
    const order = replaceMode ? [preferred, currentPick, first] : [currentPick, preferred, first];
    store.activeByCategory[cat] = (order.find(Boolean) || {}).id || null;
  });

  return { store: store, added: added, updated: updated, skipped: skipped, warnings: warnings };
}

/** 내 치수도 백업에서 되살린다(replace에서만 쓴다). */
function profileFromBackup(rawProfile, fallback) {
  const base = clone(fallback || DEFAULT_PROFILE);
  if (!rawProfile || typeof rawProfile !== 'object') return base;
  ['height', 'weight', 'waistInch'].forEach(k => {
    if (isNum(rawProfile[k]) && rawProfile[k] > 0) base[k] = rawProfile[k];
  });
  if (typeof rawProfile.topSize === 'string' && rawProfile.topSize.trim()) base.topSize = rawProfile.topSize.trim();
  if (rawProfile.measure && typeof rawProfile.measure === 'object') {
    Object.keys(base.measure).forEach(k => {
      if (isNum(rawProfile.measure[k]) && rawProfile.measure[k] > 0) base.measure[k] = rawProfile.measure[k];
      else if (rawProfile.measure[k] === null) base.measure[k] = null;
    });
  }
  return base;
}

/* ---------- 프로필 ---------- */
function loadProfile() {
  const base = clone(DEFAULT_PROFILE);
  const raw = readJSON(LS.profile, null);
  if (raw && typeof raw === 'object') {
    ['height', 'weight', 'waistInch'].forEach(k => {
      if (isNum(raw[k]) && raw[k] > 0) base[k] = raw[k];
    });
    if (typeof raw.topSize === 'string' && raw.topSize.trim()) base.topSize = raw.topSize.trim();
    if (raw.measure && typeof raw.measure === 'object') {
      Object.keys(base.measure).forEach(k => {
        if (isNum(raw.measure[k]) && raw.measure[k] > 0) base.measure[k] = raw.measure[k];
        else if (raw.measure[k] === null) base.measure[k] = null;
      });
    }
  }
  return base;
}

function effectiveMeasure(profile, key) {
  const v = profile.measure[key];
  if (isNum(v) && v > 0) return v;
  return DEFAULT_PROFILE.measure[key];
}

function waistFlatOf(profile) {
  const inch = isNum(profile.waistInch) ? profile.waistInch : DEFAULT_PROFILE.waistInch;
  return round1(inch * 1.27);
}

function waistLabel(profile) {
  const inch = isNum(profile.waistInch) ? profile.waistInch : DEFAULT_PROFILE.waistInch;
  const lo = Math.floor(inch);
  const hi = Number.isInteger(inch) ? inch : Math.ceil(inch);
  return lo === hi ? String(lo) : lo + '~' + hi;
}

/* ---------- 기준 범위 ---------- */
function buildTargets(category, profile) {
  const v = key => effectiveMeasure(profile, key);
  const base = {
    shoulder: [v('shoulder') - 2, v('shoulder') + 2],
    chest: [v('chest') - 2.5, v('chest') + 2.5],
    length: [v('length') - 2, v('length') + 2],
    sleeve: [v('sleeve') - 1.5, v('sleeve') + 1.5],
    sleeveCb: [v('sleeveCb') - 1.5, v('sleeveCb') + 1.5],
    neck: [v('neck') - 0.5, v('neck') + 0.5],
    waist: [waistFlatOf(profile) - 0.3, waistFlatOf(profile) + 1.7],
    hip: [v('hip') - 2.5, v('hip') + 2.5],
    thigh: [v('thigh') - 1.5, v('thigh') + 1.5],
    rise: [v('rise') - 2, v('rise') + 2],
    outseam: [v('outseam') - 2, v('outseam') + 2],
    inseam: [v('inseam') - 2, v('inseam') + 2],
    hem: [v('hem') - 1.5, v('hem') + 1.5],
    footLength: [v('footLength'), v('footLength') + 10],   // mm — 신발 표의 발길이는 내 발길이보다 0~10mm 큰 것이 편하다
    footWidth: [v('footWidth') - 1, v('footWidth') + 6],   // mm
  };
  const adj = (CATEGORIES[category] && CATEGORIES[category].adj) || {};
  const out = {};
  Object.keys(base).forEach(k => {
    const a = adj[k] || [0, 0];
    out[k] = [round1(base[k][0] + a[0]), round1(base[k][1] + a[1])];
  });
  return out;
}

function verdictOf(score) {
  for (let i = 0; i < VERDICT.length; i++) {
    if (score >= VERDICT[i].min) return VERDICT[i].text;
  }
  return VERDICT[VERDICT.length - 1].text;
}

/* ---------- 항목별 판정 ---------- */
function evalDetail(key, value, band) {
  const def = MEASURES[key];
  const lo = band[0];
  const hi = band[1];
  const tol = TOLERANCE[key] || 1.5;
  let diff = 0;
  if (value < lo - 0.05) diff = value - lo;
  else if (value > hi + 0.05) diff = value - hi;

  let score = 100;
  let badge = { text: '딱 맞음', cls: 'badge--ok' };
  if (diff !== 0) {
    const d = Math.abs(diff);
    score = clamp(100 - 14 * d - 2.5 * d * d, 0, 100);
    if (diff < 0) {
      badge = def.kind === 'length'
        ? { text: '짧음 주의', cls: 'badge--short' }
        : { text: '타이트', cls: 'badge--tight' };
    } else if (d <= tol) {
      badge = { text: '약간 여유', cls: 'badge--room' };
    } else if (def.kind === 'length') {
      badge = { text: '김', cls: 'badge--wide' };
    } else {
      badge = { text: '큼', cls: 'badge--wide' };
    }
  }
  return {
    key: key,
    label: def.label,
    kind: def.kind,
    value: round1(value),
    band: [round1(lo), round1(hi)],
    diff: round1(diff),
    score: Math.round(score),
    badge: badge,
    skip: false,
  };
}

const MEASURE_WORD = {
  shoulder: '어깨', chest: '가슴단면', length: '총장', sleeve: '소매', sleeveCb: '화장',
  neck: '목둘레', waist: '허리단면', hip: '힙단면', thigh: '허벅지단면',
  rise: '밑위', outseam: '아웃심', inseam: '인심', hem: '밑단',
  footLength: '발길이', footWidth: '발볼',
};

/** 받침에 따라 조사 '이/가'를 고른다. */
function subjectParticle(word) {
  const w = String(word || '');
  const last = w.charAt(w.length - 1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '이';
  return (code - 0xac00) % 28 === 0 ? '가' : '이';
}

function phraseOf(detail) {
  const w = MEASURE_WORD[detail.key] || detail.label;
  const josa = subjectParticle(w);
  const d = Math.abs(detail.diff);
  const u = unitOf(detail.key);
  if (detail.diff < 0) {
    if (detail.kind === 'length') return w + josa + ' ' + fmt(d) + u + ' 짧아요.';
    return w + josa + ' ' + fmt(d) + u + ' 좁아 여유가 없어요.';
  }
  if (detail.kind === 'length') return w + josa + ' ' + fmt(d) + u + ' 길어 수선이 필요할 수 있어요.';
  return w + '에 ' + fmt(d) + u + ' 여유가 있어요.';
}

/* ---------- 한 줄 평가 ---------- */
function median(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function evalRow(row, category, targets, opts) {
  const cfg = CATEGORIES[category];
  const shortSleeve = !!(opts && opts.shortSleeve);
  const keys = [];
  cfg.measures.forEach(k => keys.push(k));
  MEASURE_ORDER.forEach(k => {
    if (keys.indexOf(k) === -1 && isNum(row.values[k])) keys.push(k);
  });

  const details = [];
  keys.forEach(k => {
    const value = row.values[k];
    if (!isNum(value)) return;
    if (shortSleeve && (k === 'sleeve' || k === 'sleeveCb')) {
      details.push({
        key: k, label: MEASURES[k].label, kind: MEASURES[k].kind, value: round1(value),
        band: targets[k], diff: 0, score: 100,
        badge: { text: '반팔', cls: 'badge--skip' }, skip: true,
      });
      return;
    }
    details.push(evalDetail(k, value, targets[k]));
  });

  let weighted = 0;
  let weightSum = 0;
  let gap = 0;
  details.forEach(d => {
    if (d.skip) return;
    const w = (cfg.weights && cfg.weights[d.key]) || 0.8;
    weighted += d.score * w;
    weightSum += w;
    gap += Math.abs(d.diff) * w;
  });
  let score = weightSum > 0 ? weighted / weightSum : 0;

  // 필수 항목이 비어 있으면 점수를 신뢰할 수 없으므로 상한을 둔다
  const missing = [];
  (cfg.critical || []).forEach(k => {
    if (!isNum(row.values[k]) && !(shortSleeve && (k === 'sleeve' || k === 'sleeveCb'))) {
      if (k === 'outseam' && isNum(row.values.inseam)) return;
      if (k === 'sleeve' && isNum(row.values.sleeveCb)) return;
      missing.push(k);
    }
  });
  if (missing.length) score = Math.min(score, 74);

  const ranked = details.filter(d => !d.skip && Math.abs(d.diff) > 0.2)
    .sort((a, b) => a.score - b.score);
  const phrases = ranked.slice(0, 2).map(phraseOf);

  return {
    size: row.size || '',
    rowId: row.id,
    values: row.values,
    details: details,
    score: Math.round(score),
    gap: round1(gap),
    verdict: verdictOf(score),
    missingCritical: missing,
    note: phrases.join(' '),
  };
}

/* ---------- 종합 분석 ---------- */
function analyze(category, rows, profile) {
  const cfg = CATEGORIES[category];
  const targets = buildTargets(category, profile);
  const sleeves = [];
  if (category !== 'bottom') {
    rows.forEach(r => {
      if (isNum(r.values.sleeve)) sleeves.push(r.values.sleeve);
    });
  }
  const sleeveMedian = median(sleeves);
  const shortSleeve = sleeves.length > 0 && sleeveMedian !== null && sleeveMedian < 35;

  const items = rows
    .filter(r => Object.keys(r.values).some(k => isNum(r.values[k])))
    .map(r => evalRow(r, category, targets, { shortSleeve: shortSleeve }));

  const scored = items.filter(it => isNum(it.score));
  // 점수가 같으면 기준 범위에서 벗어난 폭이 작은 쪽, 그다음 사이즈 이름 순
  scored.sort((a, b) => b.score - a.score || a.gap - b.gap || a.size.localeCompare(b.size, 'ko'));

  return {
    category: category,
    targets: targets,
    items: scored,
    best: scored[0] || null,
    alt: scored[1] || null,
    shortSleeve: shortSleeve,
  };
}

/* ============================================================
   사이즈표 텍스트 파서
   ============================================================ */

const LABEL_RULES = [
  { key: 'size', re: /(사이즈|호칭|규격|size|품명|치수)/i },
  { key: 'sleeveCb', re: /(화장|center\s*back|cb\s*sleeve|등중앙)/i },
  { key: 'sleeve', re: /(소매|반소매|긴소매|sleeve|arm)/i },
  { key: 'shoulder', re: /(어깨|숄더|shoulder)/i },
  { key: 'chest', re: /(가슴|흉|chest|bust|armpit|겨드랑이)/i },
  { key: 'neck', re: /(목둘레|목\s*둘레|넥|neck|collar)/i },
  { key: 'waist', re: /(허리|waist)/i },
  { key: 'hip', re: /(힙|엉덩이|hip|seat)/i },
  { key: 'thigh', re: /(허벅지|대퇴|thigh)/i },
  { key: 'rise', re: /(밑위|rise|crotch)/i },
  { key: 'inseam', re: /(인심|inseam)/i },
  { key: 'outseam', re: /(아웃심|outseam|총길이|바지길이|leg\s*length)/i },
  { key: 'hem', re: /(밑단|hem|leg\s*opening)/i },
  { key: 'footWidth', re: /(발볼|볼넓이|볼\s*넓이|발폭|foot\s*width)/i },
  { key: 'footLength', re: /(발길이|발\s*길이|신발길이|발치수|foot\s*length)/i },
  { key: 'length', re: /(총장|총기장|기장|길이|length|衣长)/i },
];

function matchLabel(text, category) {
  const t = String(text || '').trim();
  if (!t) return null;
  for (let i = 0; i < LABEL_RULES.length; i++) {
    const rule = LABEL_RULES[i];
    if (rule.re.test(t)) {
      if (rule.key === 'length' && category === 'bottom') return 'outseam';
      if (rule.key === 'size') return 'size';
      return rule.key;
    }
  }
  return null;
}

function isCircLabel(text) {
  return /둘레|circumference|주위/i.test(String(text || ''));
}

function splitCells(line) {
  let parts;
  let keepEmpty = false;
  if (line.indexOf('\t') !== -1) { parts = line.split('\t'); keepEmpty = true; }
  else if (line.indexOf('|') !== -1) { parts = line.split('|'); keepEmpty = true; }
  else if (/\s{2,}/.test(line)) parts = line.split(/\s{2,}/);
  else if (line.indexOf(',') !== -1) parts = line.split(',');
  else if (line.split(' ').filter(Boolean).length >= 4) parts = line.split(' ');
  else parts = [line];
  let cells = parts.map(p => p.trim());
  if (keepEmpty) {
    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    while (cells.length && cells[0] === '') cells.shift();
  } else {
    cells = cells.filter(p => p !== '');
  }
  return cells;
}

function parseNum(raw) {
  if (raw == null) return null;
  let t = String(raw).trim();
  if (!t) return null;
  t = t.replace(/\([^)]*\)/g, ' ');          // 괄호 안 inch 표기 제거
  t = t.replace(/[약≒]/g, ' ');
  t = t.replace(/cm/gi, ' ');
  const nums = t.match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return null;
  if (nums.length === 2 && /[~\-/]/.test(t)) {
    const a = parseFloat(nums[0]);
    const b = parseFloat(nums[1]);
    if (isFinite(a) && isFinite(b)) return round1((a + b) / 2);
  }
  const n = parseFloat(nums[0]);
  return isFinite(n) ? n : null;
}

function looksLikeSize(text) {
  return /^(x{0,3}[sml]|free|[0-9]{2,3}(\(.*\))?|[0-9]{2,3}\/[0-9]{2,3})$/i.test(String(text || '').trim());
}

/**
 * OCR은 열 이름 사이 간격을 한 칸으로 붙여 읽을 때가 있다.
 * ('가슴단면 총장') 한 칸에 이름이 둘 이상 들어 있으면 다시 나눈다.
 */
function expandHeaderCells(cells, category) {
  const generic = /^(길이|너비|단면|둘레|폭|기장|장)$/;
  const out = [];
  cells.forEach(cell => {
    const parts = String(cell).split(/\s+/).filter(Boolean);
    if (parts.length >= 2 &&
        parts.filter(p => matchLabel(p, category)).length >= 2 &&
        !parts.some(p => generic.test(p))) {
      parts.forEach(p => out.push(p));
    } else {
      out.push(cell);
    }
  });
  return out;
}

/**
 * 붙여넣은 표를 사이즈 행 배열로 변환한다.
 * @returns {{rows: Array, orientation: string, converted: Array<string>, ignored: number}}
 */
function parseChart(text, category) {
  const converted = [];
  const rawLines = String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[｜│]/g, '|')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !/^[-=_·.\s]+$/.test(l));

  const lines = rawLines.map(splitCells).filter(c => c.length);
  if (!lines.length) return { rows: [], orientation: 'none', converted: converted, ignored: 0 };

  // 1) 헤더 행 찾기
  let headerIdx = -1;
  let header = null;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cells = lines[i];
    const matches = cells.map(c => matchLabel(c, category));
    const labelCount = matches.filter(k => k && k !== 'size').length;
    if (labelCount >= 2 || (matches[0] === 'size' && labelCount >= 1)) {
      headerIdx = i;
      header = matches;
      break;
    }
  }

  if (headerIdx !== -1) {
    const expanded = expandHeaderCells(lines[headerIdx], category);
    if (expanded.length !== lines[headerIdx].length) {
      lines[headerIdx] = expanded;
      header = expanded.map(c => matchLabel(c, category));
    }
  }

  if (headerIdx !== -1 && header) {
    const cols = header.map((key, idx) => {
      if (!key) return null;
      return { key: key, idx: idx, circ: isCircLabel(lines[headerIdx][idx]) };
    }).filter(Boolean);
    const sizeCol = cols.find(c => c.key === 'size');
    const rows = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = lines[i];
      if (!cells.length) continue;
      const values = {};
      let numCells = 0;
      cols.forEach(c => {
        if (c.key === 'size') return;
        const num = parseNum(cells[c.idx]);
        if (num === null || num <= 0 || num > 300) return;
        numCells += 1;
        let val = num;
        if (c.circ && ['chest', 'waist', 'hip', 'thigh', 'hem'].indexOf(c.key) !== -1) {
          val = round1(num / 2);
          if (converted.indexOf(c.key) === -1) converted.push(c.key);
        } else if (c.key === 'chest' && num > 80) {
          val = round1(num / 2);
          if (converted.indexOf(c.key) === -1) converted.push(c.key);
        } else if ((c.key === 'waist' || c.key === 'hip') && num > 70) {
          val = round1(num / 2);
          if (converted.indexOf(c.key) === -1) converted.push(c.key);
        }
        values[c.key] = val;
      });
      if (numCells < 2) continue;
      let size = '';
      if (sizeCol) size = cells[sizeCol.idx] || '';
      if (!size) {
        const first = cells.find((c, idx) => idx !== (sizeCol ? sizeCol.idx : -1) && !parseNum(c));
        size = looksLikeSize(first) ? first : '';
      }
      if (!size) size = '사이즈 ' + (rows.length + 1);
      rows.push({ id: uid(), size: String(size).trim(), values: values });
    }
    if (rows.length) {
      return { rows: rows, orientation: 'header', converted: converted, ignored: 0 };
    }
  }

  // 2) 세로 표 (항목이 행, 사이즈가 열)
  const labelLines = lines.filter(cells => matchLabel(cells[0], category) && matchLabel(cells[0], category) !== 'size');
  if (labelLines.length >= 2) {
    let sizeNames = null;
    const firstIdx = lines.indexOf(labelLines[0]);
    for (let i = 0; i < firstIdx; i++) {
      const cells = lines[i];
      if (cells.length >= 2 && !cells.some(c => matchLabel(c, category))) {
        sizeNames = cells.slice();
        break;
      }
    }
    const rows = [];
    const rowMap = {};
    labelLines.forEach(cells => {
      const meta = matchLabel(cells[0], category);
      if (!meta || meta === 'size') return;
      const circ = isCircLabel(cells[0]);
      for (let j = 1; j < cells.length; j++) {
        const num = parseNum(cells[j]);
        if (num === null) continue;
        let val = num;
        if (circ && ['chest', 'waist', 'hip', 'thigh', 'hem'].indexOf(meta) !== -1) {
          val = round1(num / 2);
          if (converted.indexOf(meta) === -1) converted.push(meta);
        }
        const name = sizeNames && sizeNames[j - 1] ? sizeNames[j - 1] : '사이즈 ' + j;
        if (!rowMap[name]) {
          rowMap[name] = { id: uid(), size: name, values: {} };
          rows.push(rowMap[name]);
        }
        rowMap[name].values[meta] = val;
      }
    });
    if (rows.length) {
      return { rows: rows, orientation: 'vertical', converted: converted, ignored: 0 };
    }
  }

  // 3) 한 줄에 "어깨 48 가슴 55 총장 70" 형태
  const rows = [];
  lines.forEach(cells => {
    if (cells.length < 3) return;
    const values = {};
    let found = 0;
    for (let i = 0; i < cells.length - 1; i++) {
      const key = matchLabel(cells[i], category);
      if (!key || key === 'size') continue;
      const num = parseNum(cells[i + 1]);
      if (num === null) continue;
      let val = num;
      if (isCircLabel(cells[i]) && ['chest', 'waist', 'hip', 'thigh', 'hem'].indexOf(key) !== -1) {
        val = round1(num / 2);
        if (converted.indexOf(key) === -1) converted.push(key);
      }
      values[key] = val;
      found += 1;
      i += 1;
    }
    if (found < 2) return;
    let size = '';
    const first = cells[0];
    if (first && !matchLabel(first, category) && parseNum(first) === null) {
      size = first;
    } else {
      const cand = cells.find(c => /^(x{0,3}[sml]|free)$/i.test(c));
      if (cand) size = cand;
    }
    rows.push({ id: uid(), size: size || '사이즈 ' + (rows.length + 1), values: values });
  });

  return { rows: rows, orientation: rows.length ? 'inline' : 'none', converted: converted, ignored: 0 };
}

function sampleTextFor(category) {
  if (category === 'shoe') {
    return ['사이즈\t발길이\t발볼',
      '255\t255\t96',
      '260\t260\t98',
      '265\t265\t100',
      '270\t270\t101'].join('\n');
  }
  if (category === 'bottom') {
    return ['사이즈\t허리단면\t힙단면\t아웃심\t허벅지단면\t밑위\t밑단',
      '30\t38\t49\t103\t29.5\t27\t17',
      '32\t41\t51\t105\t31\t28\t18',
      '34\t43.5\t53\t107\t32.5\t29\t19'].join('\n');
  }
  if (category === 'shirt') {
    return ['사이즈\t목둘레\t어깨\t가슴단면\t소매\t화장\t총장',
      '100\t39\t47\t56\t63\t85\t78',
      '105\t40\t49\t59\t64.5\t86.5\t80',
      '110\t41\t51\t62\t66\t88\t82'].join('\n');
  }
  if (category === 'outer') {
    return ['사이즈\t어깨\t가슴단면\t총장\t소매',
      'M\t47\t56\t70\t62',
      'L\t49\t59\t72\t64',
      'XL\t51\t62\t74\t66',
      '2XL\t53\t65\t76\t68'].join('\n');
  }
  return ['사이즈\t어깨\t가슴단면\t총장\t소매',
    'M\t46\t54\t68\t59',
    'L\t48\t56\t70\t61',
    'XL\t50\t58\t72\t63',
    '2XL\t52\t60\t74\t65'].join('\n');
}

/* ============================================================
   Part B: state, rendering, OCR, try-on, boot
   ============================================================ */

const state = {
  profile: null,
  rows: { top: [], outer: [], shirt: [], bottom: [], shoe: [] },
  chartStore: null,
  category: 'top',
  method: 'ocr',
  ocrFile: null,
  ocrUrl: null,
  converted: [],
  shortSleeve: false,
  tab: 'analyze',
  fit: {
    bg: null, garment: null, bgUrl: null, garmentUrl: null,
    x: 0, y: -30, scale: 1, rot: 0, opacity: 0.92, flip: false,
    baseScale: 1, ready: false,
  },
};

const MEASURE_FIELDS = [
  ['shoulder', '어깨너비'], ['chest', '가슴단면'],
  ['length', '상의 총장'], ['sleeve', '소매'],
  ['sleeveCb', '화장'], ['neck', '목둘레'],
  ['hip', '힙단면'], ['thigh', '허벅지단면'],
  ['rise', '밑위'], ['outseam', '아웃심'],
  ['inseam', '인심'], ['hem', '밑단'],
  ['footLength', '발길이(mm)'], ['footWidth', '발볼(mm)'],
];

/* ---------- 사이즈 행 저장 ---------- */
function normalizeRow(raw) {
  return sanitizeRow(raw);
}

/** 종류별 지금 쓰는 표. 없으면 null. */
function activeChart(category) {
  const cat = category || state.category;
  return activeCharts(state.chartStore)[cat] || null;
}

function chartsFor(category) {
  return (state.chartStore.charts || []).filter(c => c.category === category);
}

/** 보관함(새 키)과 옛 키를 함께 저장한다. 옛 키는 지우지 않고 지금 표를 비춘다. */
let chartSaveWarned = false;
function persistChartStore() {
  const ok = writeJSON(LS.charts, state.chartStore);
  writeJSON(LS.rows, legacyRowsFromStore(state.chartStore));
  if (!ok && !chartSaveWarned) {
    chartSaveWarned = true;
    toast('저장 공간이 부족해 보관함을 저장하지 못했어요. 백업을 내려받아 두세요.');
  }
}

/** 화면의 rows를 지금 쓰는 표에 적어 넣는다. 표가 없으면 '기본 표'를 만든다. */
function saveRows(category) {
  const cat = category || state.category;
  let chart = activeChart(cat);
  if (!chart) {
    chart = {
      id: uid(), name: DEFAULT_CHART_NAME, category: cat, rows: [], memo: '',
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    state.chartStore.charts.push(chart);
    state.chartStore.activeByCategory[cat] = chart.id;
  }
  chart.rows = (state.rows[cat] || []).map(sanitizeRow);
  chart.updatedAt = Date.now();
  persistChartStore();
}

function setRows(category, rows) {
  state.rows[category] = (rows || []).map(sanitizeRow);
  saveRows(category);
  renderCharts();
  renderTable();
  renderResults();
}

function currentRows() {
  return state.rows[state.category] || [];
}

/* ---------- 보관한 표 고르기 ---------- */
function renderCharts() {
  const cat = state.category;
  const list = chartsFor(cat);
  const chart = activeChart(cat);

  const sel = $('#chartSelect');
  if (sel) {
    if (!list.length) {
      sel.innerHTML = '<option value="">아직 보관한 표가 없어요</option>';
    } else {
      sel.innerHTML = list.map(c =>
        '<option value="' + escapeHtml(c.id) + '"' + (chart && chart.id === c.id ? ' selected' : '') + '>' +
        escapeHtml(c.name) + ' · ' + c.rows.length + '줄</option>'
      ).join('');
    }
    sel.disabled = !list.length;
  }

  const count = $('#chartCount');
  if (count) count.textContent = String(list.length);

  const memo = $('#chartMemo');
  if (memo) {
    memo.disabled = !chart;
    if (document.activeElement !== memo) memo.value = chart ? (chart.memo || '') : '';
  }

  const status = $('#chartStatus');
  if (status) {
    status.textContent = chart
      ? '“' + chart.name + '” · ' + chart.rows.length + '줄 · ' + new Date(chart.updatedAt).toLocaleDateString('ko-KR') + ' 저장'
      : '새 표를 누르면 여기에 보관돼요.';
  }

  ['#chartRenameBtn', '#chartDupBtn', '#chartDeleteBtn'].forEach(s => {
    const el = $(s);
    if (el) el.disabled = !chart;
  });
}

function uniqueChartName(category, base) {
  const names = chartsFor(category).map(c => c.name);
  let name = String(base == null ? '' : base).trim().slice(0, 40) || '새 표';
  if (names.indexOf(name) === -1) return name;
  let n = 2;
  while (names.indexOf(name + ' ' + n) !== -1) n += 1;
  return name + ' ' + n;
}

function selectChart(id) {
  const cat = state.category;
  const chart = chartsFor(cat).find(c => c.id === id);
  if (!chart) return;
  saveRows(cat);
  state.chartStore.activeByCategory[cat] = chart.id;
  state.rows[cat] = chart.rows.map(sanitizeRow);
  persistChartStore();
  renderCharts();
  renderTable();
  renderResults();
  renderBasis();
}

function createChart(opts) {
  const o = opts || {};
  const cat = state.category;
  saveRows(cat);
  const name = uniqueChartName(cat, o.name || '새 표');
  const chart = {
    id: uid(), name: name, category: cat, memo: '',
    rows: o.rows ? o.rows.map(sanitizeRow) : [],
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  state.chartStore.charts.push(chart);
  state.chartStore.activeByCategory[cat] = chart.id;
  state.rows[cat] = chart.rows.map(sanitizeRow);
  persistChartStore();
  renderCharts();
  renderTable();
  renderResults();
  renderBasis();
  toast('“' + name + '” 표를 새로 만들었어요.');
}

function renameChart() {
  const chart = activeChart();
  if (!chart) return;
  const input = window.prompt('표 이름 (브랜드·상품명을 적으면 찾기 쉬워요)', chart.name);
  if (input === null) return;
  const name = uniqueChartName(chart.category, input);
  if (!name || name === chart.name) return;
  chart.name = name;
  chart.updatedAt = Date.now();
  persistChartStore();
  renderCharts();
  toast('표 이름을 “' + name + '”로 바꿨어요.');
}

function duplicateChart() {
  const chart = activeChart();
  if (!chart) return;
  createChart({ name: chart.name + ' 사본', rows: chart.rows });
}

function deleteChart() {
  const chart = activeChart();
  if (!chart) return;
  const extra = state.chartStore.charts.filter(c => c.category === chart.category).length - 1;
  const msg = '“' + chart.name + '” 표(' + chart.rows.length + '줄)를 지울까요?' +
    (extra > 0 ? '\n다른 표 ' + extra + '벌은 그대로 남습니다.' : '\n이 종류의 마지막 표라서 지우면 작업 중인 표가 비워집니다.');
  if (!window.confirm(msg)) return;
  state.chartStore.charts = state.chartStore.charts.filter(c => c.id !== chart.id);
  const rest = chartsFor(chart.category)[0] || null;
  state.chartStore.activeByCategory[chart.category] = rest ? rest.id : null;
  state.rows[chart.category] = rest ? rest.rows.map(sanitizeRow) : [];
  persistChartStore();
  renderCharts();
  renderTable();
  renderResults();
  toast('표를 지웠어요.');
}

let chartMemoTimer = null;
function commitChartMemo(value) {
  const chart = activeChart();
  if (chart) {
    chart.memo = String(value || '').slice(0, 500);
    chart.updatedAt = Date.now();
  }
  if (chartMemoTimer) clearTimeout(chartMemoTimer);
  chartMemoTimer = setTimeout(() => {
    persistChartStore();
    renderResults();
  }, 350);
}

function syncRowsFromCharts() {
  const active = activeCharts(state.chartStore);
  Object.keys(CATEGORIES).forEach(cat => {
    state.rows[cat] = active[cat] ? active[cat].rows.map(sanitizeRow) : [];
  });
}

/* ---------- 토스트 ---------- */
let toastTimer = null;
function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-on');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

/* ---------- 기준 요약 ---------- */
function basisItems(category) {
  const t = buildTargets(category, state.profile);
  const item = k => [MEASURES[k].label, fmt(t[k][0]) + '~' + fmt(t[k][1]), unitOf(k)];
  if (category === 'bottom') {
    return [item('waist'), item('outseam'), item('hip'), item('rise')];
  }
  if (category === 'shirt') {
    return [item('shoulder'), item('chest'), item('sleeveCb'), item('neck')];
  }
  if (category === 'shoe') {
    return [item('footLength'), item('footWidth')];
  }
  return [item('shoulder'), item('chest'), item('length'), item('sleeve')];
}

function renderBasis() {
  const grid = $('#basisGrid');
  if (!grid) return;
  const items = basisItems(state.category);
  grid.innerHTML = items.map(([label, value, unit]) =>
    '<div class="basis__item"><span class="basis__label">' + escapeHtml(label) +
    '</span><span class="basis__value">' + escapeHtml(value) + '<small>' + escapeHtml(unit || 'cm') + '</small></span></div>'
  ).join('');

  const t = buildTargets(state.category, state.profile);
  let hint = '';
  if (state.category === 'top') {
    hint = '총장 ' + fmt(t.length[0]) + 'cm 아래로 내려가면 짧게 느껴져요. 길이와 소매를 먼저 보세요.';
  } else if (state.category === 'outer') {
    hint = '안에 입을 옷을 생각해 가슴단면은 ' + fmt(t.chest[0]) + 'cm부터 여유로 봅니다.';
  } else if (state.category === 'shirt') {
    hint = '정장셔츠는 목둘레와 화장(등 중앙~소매끝)이 핵심이에요. 화장 ' + fmt(t.sleeveCb[0]) + 'cm 이상.';
  } else if (state.category === 'shoe') {
    hint = '내 발길이 ' + fmt(effectiveMeasure(state.profile, 'footLength')) + 'mm보다 0~10mm 큰 신발이 편해요(지금 범위 ' +
      fmt(t.footLength[0]) + '~' + fmt(t.footLength[1]) + 'mm). 볼이 넓은 신발은 발볼 ' + fmt(t.footWidth[0]) + 'mm부터 봅니다.';
  } else {
    hint = '허리 ' + fmt(t.waist[0]) + '~' + fmt(t.waist[1]) + 'cm는 ' + waistLabel(state.profile) +
      '인치에 맞춘 단면이에요. 아웃심 ' + fmt(t.outseam[0]) + 'cm 이상이면 발목이 덮여요.';
  }
  const hintEl = $('#basisHint');
  if (hintEl) hintEl.textContent = hint;
}

function renderHeader() {
  const p = state.profile;
  const el = $('#headerProfile');
  if (el) {
    el.textContent = fmt(p.height, 0) + 'cm · ' + fmt(p.weight, 0) + 'kg · 상의 ' + (p.topSize || '2XL');
  }
}

/* ---------- 사이즈표 ---------- */
function columnsFor(category, rows) {
  const cfg = CATEGORIES[category];
  const cols = [];
  cfg.measures.forEach(k => { if (cols.indexOf(k) === -1) cols.push(k); });
  MEASURE_ORDER.forEach(k => {
    if (cols.indexOf(k) !== -1) return;
    if (rows.some(r => isNum(r.values[k]))) cols.push(k);
  });
  return cols;
}

function renderTable() {
  const category = state.category;
  const rows = currentRows();
  const cols = columnsFor(category, rows);
  const table = $('#sizeTable');
  const thead = $('#sizeThead');
  const tbody = $('#sizeTbody');
  const empty = $('#tableEmpty');
  const count = $('#rowCount');
  if (!table || !thead || !tbody) return;

  if (count) count.textContent = String(rows.length);

  if (!rows.length) {
    table.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }
  table.hidden = false;
  if (empty) empty.hidden = true;

  thead.innerHTML = '<tr><th scope="col">사이즈</th>' +
    cols.map(k => '<th scope="col">' + escapeHtml(measureLabel(k, true)) + '</th>').join('') +
    '<th scope="col" class="col-memo">핏 메모</th>' +
    '<th scope="col" class="col-del"><span class="sr-only">삭제</span></th></tr>';

  tbody.innerHTML = rows.map(row => {
    const cells = cols.map(k => {
      const v = row.values[k];
      return '<td><input class="cell-input" type="text" inputmode="decimal" ' +
        'data-row="' + escapeHtml(row.id) + '" data-key="' + escapeHtml(k) + '" ' +
        'value="' + escapeHtml(fmt(v)) + '" placeholder="—" ' +
        'aria-label="' + escapeHtml((row.size || '사이즈') + ' ' + measureLabel(k, false)) + '" /></td>';
    }).join('');
    return '<tr data-row="' + escapeHtml(row.id) + '">' +
      '<td><input class="cell-input cell-input--size" type="text" data-row="' + escapeHtml(row.id) +
      '" data-key="__size" value="' + escapeHtml(row.size) + '" placeholder="사이즈" aria-label="사이즈 이름" /></td>' +
      cells +
      '<td><input class="cell-input cell-input--memo" type="text" data-row="' + escapeHtml(row.id) +
      '" data-key="__memo" value="' + escapeHtml(row.memo || '') + '" placeholder="예: 어깨 여유 있음" ' +
      'maxlength="200" aria-label="' + escapeHtml((row.size || '사이즈') + ' 핏 메모') + '" /></td>' +
      '<td><button type="button" class="del-row" data-del="' + escapeHtml(row.id) +
      '" aria-label="' + escapeHtml((row.size || '이 행') + ' 삭제') + '">&times;</button></td></tr>';
  }).join('');
}

function compareCue(best, alt) {
  const worst = alt.details
    .filter(d => !d.skip && Math.abs(d.diff) > 0.2)
    .sort((a, b) => a.score - b.score)[0];
  if (!worst) return '';
  const word = MEASURE_WORD[worst.key] || worst.label;
  const d = fmt(Math.abs(worst.diff));
  return word + subjectParticle(word) + ' ' + d + unitOf(worst.key) + ' ' +
    (worst.diff < 0 ? '작아 조금 더 타이트' : '커서 조금 더 여유');
}

/* ---------- 추천 결과 ---------- */
function renderResults() {
  const rows = currentRows();
  const emptyEl = $('#resultEmpty');
  const bodyEl = $('#resultBody');
  if (!emptyEl || !bodyEl) return;

  const result = analyze(state.category, rows, state.profile);
  const items = result.items;

  if (!rows.length) {
    emptyEl.hidden = false;
    bodyEl.hidden = true;
    emptyEl.innerHTML = '<span class="result-empty__icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/>' +
      '<path d="m7.5 15 3.2-4 2.6 2.6L20 7"/></svg></span>' +
      '<p><strong>추천 사이즈가 여기에 나와요.</strong><br />표를 채우면 항목별로 딱 맞는지 바로 비교해 드립니다.</p>';
    return;
  }

  if (!items.length) {
    emptyEl.hidden = false;
    bodyEl.hidden = true;
    emptyEl.innerHTML = '<span class="result-empty__icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"/>' +
      '<path d="M12 8.4v4.4M12 15.6h.01"/></svg></span>' +
      '<p><strong>숫자가 아직 비어 있어요.</strong><br />사이즈표의 치수를 채우면 추천을 계산합니다.</p>';
    return;
  }

  emptyEl.hidden = true;
  bodyEl.hidden = false;

  const best = result.best;
  const alt = result.alt;

  $('#recScore').textContent = best.score + '점 · ' + best.verdict;
  $('#recSize').innerHTML = escapeHtml(best.size || '사이즈') +
    '<small>' + escapeHtml(CATEGORIES[state.category].name) + '</small>';

  let note = best.note;
  if (!note) note = '주요 항목이 모두 기준 범위 안에 들어와요.';
  if (result.shortSleeve) note += ' 반팔 소매는 길이 비교에서 제외했어요.';
  if (best.missingCritical.length) {
    const names = best.missingCritical.map(k => MEASURES[k].label).join('·');
    note += ' ' + names + ' 값이 없어 그 항목은 비교하지 못했어요.';
  }
  const bestRow = rows.find(r => r.id === best.rowId);
  if (bestRow && bestRow.memo) note += ' · ' + bestRow.memo;
  $('#recNote').textContent = note;

  const memoEl = $('#recChartMemo');
  if (memoEl) {
    const chart = activeChart();
    const chartMemo = chart && chart.memo ? chart.memo : '';
    memoEl.hidden = !chartMemo;
    memoEl.textContent = chartMemo ? '표 메모 · ' + chartMemo : '';
  }

  const altEl = $('#recAlt');
  if (alt) {
    altEl.hidden = false;
    $('#recAltSize').textContent = alt.size || '사이즈';
    let altNote = alt.score + '점 · ' + alt.verdict;
    const cue = compareCue(best, alt);
    if (cue) altNote += ' · ' + cue;
    else if (alt.score >= best.score - 5) altNote += ' · 거의 비슷해요';
    else if (alt.score < best.score - 18) altNote += ' · 차이가 커요';
    $('#recAltNote').textContent = altNote;
  } else {
    altEl.hidden = true;
  }

  $('#recDetail').innerHTML = best.details.map(d => {
    const u = unitOf(d.key);
    const band = d.skip ? '' : '<span>기준 ' + fmt(d.band[0]) + '~' + fmt(d.band[1]) + (u === 'cm' ? '' : u) + '</span>';
    return '<div class="measure-row">' +
      '<span class="measure-name">' + escapeHtml(d.label) + band + '</span>' +
      '<span class="measure-value">' + fmt(d.value) + '<small>' + escapeHtml(u) + '</small></span>' +
      '<span class="badge ' + d.badge.cls + '">' + escapeHtml(d.badge.text) + '</span>' +
      '</div>';
  }).join('') || '<p class="hint" style="padding-bottom:12px">비교할 항목이 없어요. 사이즈표 열 이름을 확인해 주세요.</p>';

  const list = items.length > 1 ? '<p class="scores__title">사이즈별 점수</p>' +
    items.map(it => '<div class="score-item' + (it.rowId === best.rowId ? ' is-top' : '') + '">' +
      '<span class="score-item__size">' + escapeHtml(it.size || '—') + '</span>' +
      '<span class="score-track"><span style="width:' + clamp(it.score, 2, 100) + '%"></span></span>' +
      '<span class="score-item__val">' + it.score + '</span></div>').join('') : '';
  $('#scoreList').innerHTML = list;

  let legend = '항목별 판정은 내 치수 기준에 여유를 더한 범위와 비교한 결과예요.';
  if (state.converted.length) {
    legend += ' ' + state.converted.map(k => MEASURES[k].label).join('·') + '은(는) 둘레 표기를 단면으로 환산했어요.';
  }
  $('#recLegend').textContent = legend;
}

/* ---------- 샘플 ---------- */
function renderPresets() {
  const wrap = $('#presetRow');
  if (!wrap) return;
  wrap.innerHTML = PRESETS.map(p =>
    '<button type="button" class="preset-chip' + (p.category === state.category ? ' is-on' : '') +
    '" data-preset="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + '</button>'
  ).join('');
}

function loadPreset(id) {
  const preset = PRESETS.find(p => p.id === id);
  if (!preset) return;
  state.category = preset.category;
  state.converted = [];
  writeJSON(LS.category, state.category);
  syncCategoryUI();
  setRows(preset.category, preset.rows.map(r => ({ id: uid(), size: r.size, values: clone(r.values) })));
  renderBasis();
  renderPresets();
  const chart = activeChart(preset.category);
  toast('\'' + preset.name + '\' 표를 ' + (chart ? '“' + chart.name + '”에 ' : '') + '불러왔어요.');
  const card = $('#tableCard');
  if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- 카테고리 ---------- */
function syncCategoryUI() {
  $$('#categoryChips .chip').forEach(btn => {
    const on = btn.getAttribute('data-cat') === state.category;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const ta = $('#pasteInput');
  if (ta) ta.placeholder = sampleTextFor(state.category);
}

function selectCategory(cat) {
  if (!CATEGORIES[cat] || cat === state.category) return;
  state.category = cat;
  state.converted = [];
  writeJSON(LS.category, cat);
  syncCategoryUI();
  renderBasis();
  renderCharts();
  renderTable();
  renderResults();
  renderPresets();
}

/* ---------- 프로필 화면 ---------- */
function renderProfileForm() {
  const p = state.profile;
  const set = (sel, val) => {
    const el = $(sel);
    if (el) el.value = val == null ? '' : String(val);
  };
  set('#inHeight', fmt(p.height));
  set('#inWeight', fmt(p.weight));
  set('#inWaist', fmt(p.waistInch));
  set('#inTopSize', p.topSize || '');

  const grid = $('#measureGrid');
  if (grid) {
    grid.innerHTML = MEASURE_FIELDS.map(([key, label]) => {
      const v = p.measure[key];
      return '<label class="field"><span class="field__label">' + escapeHtml(label) +
        '</span><input class="input measure-input" type="text" inputmode="decimal" data-measure="' +
        escapeHtml(key) + '" value="' + escapeHtml(fmt(v)) + '" placeholder="' +
        escapeHtml(fmt(DEFAULT_PROFILE.measure[key])) + '" /></label>';
    }).join('');
  }
  renderHero();
}

function renderHero() {
  const p = state.profile;
  const setHtml = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
  setHtml('#heroHeight', fmt(p.height, 0) + '<small>cm</small>');
  setHtml('#heroWeight', fmt(p.weight, 0) + '<small>kg</small>');
  setHtml('#heroWaist', waistLabel(p) + '<small>in</small>');
  const top = String(p.topSize || '2XL');
  const num = (top.match(/\d{2,3}/) || [''])[0];
  setHtml('#heroTop', escapeHtml(top.replace(/\s*\(?\d{2,3}\)?/, '').trim() || '2XL') +
    (num ? '<small>' + escapeHtml(num) + '</small>' : ''));
}

function renderGuide() {
  const wrap = $('#guideList');
  if (!wrap) return;
  const p = state.profile;
  const t = k => buildTargets(k, p);
  const top = t('top');
  const outer = t('outer');
  const shirt = t('shirt');
  const bottom = t('bottom');
  const shoe = t('shoe');
  const r = (band) => fmt(band[0]) + '~' + fmt(band[1]);

  const items = [
    {
      title: '티셔츠 · 맨투맨 · 니트',
      sub: '길이와 소매가 핵심',
      size: p.topSize || '2XL (110)',
      rows: [
        ['어깨', r(top.shoulder)], ['가슴단면', r(top.chest)],
        ['총장', r(top.length)], ['소매', r(top.sleeve)],
      ],
      checks: [
        '총장 ' + fmt(top.length[0]) + 'cm 이상 — 그 아래면 허리선이 드러나요',
        '어깨 ' + fmt(top.shoulder[0]) + 'cm 이상, 드롭숄더면 ' + fmt(top.shoulder[1]) + 'cm까지 괜찮아요',
        '소매는 어깨선부터 ' + fmt(top.sleeve[0]) + 'cm 이상',
        '가슴단면 ' + fmt(top.chest[0]) + '~' + fmt(top.chest[1]) + 'cm (슬림하면 아래쪽)',
      ],
    },
    {
      title: '셔츠 · 정장셔츠',
      sub: '목둘레와 화장으로 고르기',
      size: fmt(shirt.neck[1]) + 'cm · 16"',
      rows: [
        ['목둘레', r(shirt.neck)], ['어깨', r(shirt.shoulder)],
        ['화장', r(shirt.sleeveCb)], ['총장', r(shirt.length)],
      ],
      checks: [
        '목둘레 ' + fmt(shirt.neck[0]) + '~' + fmt(shirt.neck[1]) + 'cm (15.5~16인치)',
        '화장 ' + fmt(shirt.sleeveCb[0]) + 'cm 이상 — 손목까지 덮여야 해요',
        '슬림핏은 가슴단면 ' + fmt(shirt.chest[0]) + '~' + fmt(shirt.chest[0] + 2) + 'cm',
        '총장 ' + fmt(shirt.length[0]) + 'cm 이상이면 바지에 넣어도 잘 안 빠져요',
      ],
    },
    {
      title: '아우터 · 자켓 · 코트',
      sub: '안에 입는 옷만큼 여유 두기',
      size: '105~110',
      rows: [
        ['어깨', r(outer.shoulder)], ['가슴단면', r(outer.chest)],
        ['총장', r(outer.length)], ['소매', r(outer.sleeve)],
      ],
      checks: [
        '니트·맨투맨 위에 입으면 가슴단면 +3cm 여유를 두세요',
        '어깨 ' + fmt(outer.shoulder[0]) + '~' + fmt(outer.shoulder[1]) + 'cm',
        '자켓 총장 ' + fmt(outer.length[0]) + 'cm 이상, 코트는 100cm 이상',
        '소매 ' + fmt(outer.sleeve[0]) + 'cm 이상이면 손등이 덮여요',
      ],
    },
    {
      title: '바지 · 데님 · 슬랙스',
      sub: '허리 인치와 아웃심',
      size: waistLabel(p) + '인치',
      rows: [
        ['허리단면', r(bottom.waist)], ['힙단면', r(bottom.hip)],
        ['아웃심', r(bottom.outseam)], ['밑위', r(bottom.rise)],
      ],
      checks: [
        '허리단면 ' + fmt(bottom.waist[0]) + '~' + fmt(bottom.waist[1]) + 'cm (' + waistLabel(p) + '인치)',
        '아웃심 ' + fmt(bottom.outseam[0]) + 'cm 이상 — 그 아래면 발목이 드러나요',
        '인심 ' + fmt(bottom.inseam[0]) + '~' + fmt(bottom.inseam[1]) + 'cm',
        '허벅지단면 ' + fmt(bottom.thigh[0]) + 'cm 이상이면 앉기 편해요',
      ],
    },
    {
      title: '신발 · 스니커즈 · 구두',
      sub: '발길이와 발볼(mm)',
      unit: 'mm',
      size: fmt(effectiveMeasure(p, 'footLength')) + 'mm',
      rows: [
        ['발길이', r(shoe.footLength)], ['발볼', r(shoe.footWidth)],
      ],
      checks: [
        '발길이 ' + fmt(shoe.footLength[0]) + '~' + fmt(shoe.footLength[1]) + 'mm — 내 발길이에 여유 0~10mm를 더한 범위',
        '발볼 ' + fmt(shoe.footWidth[0]) + 'mm부터 편해요. 좁은 신발은 발길이를 반 사이즈 올리세요',
        '같은 265라도 브랜드마다 3~5mm 차이가 나니 표를 여러 벌 보관해 두세요',
        '두꺼운 양말을 신고 잴 때는 발길이에 +5mm를 더 보세요',
      ],
    },
  ];

  wrap.innerHTML = items.map(item => {
    const unit = item.unit || 'cm';
    return '<article class="guide"><div class="guide__head"><div><h3 class="guide__title">' +
    escapeHtml(item.title) + '</h3><p class="guide__sub">' + escapeHtml(item.sub) + '</p></div>' +
    '<span class="guide__size">' + escapeHtml(item.size) + '</span></div>' +
    '<dl class="guide__rows">' + item.rows.map(([label, val]) =>
      '<div class="guide__row"><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(val) +
      '<small>' + escapeHtml(unit) + '</small></dd></div>').join('') + '</dl>' +
    '<ul class="guide__check">' + item.checks.map(c => '<li>' + escapeHtml(c) + '</li>').join('') +
    '</ul></article>';
  }).join('');
}

let saveTimer = null;
function persistProfile() {
  const ok = writeJSON(LS.profile, state.profile);
  const el = $('#saveState');
  if (el) {
    el.textContent = ok ? '저장됨' : '저장 공간을 쓸 수 없어요';
    el.classList.add('is-saving');
    setTimeout(() => { el.textContent = '자동 저장'; el.classList.remove('is-saving'); }, 1400);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persistProfile, 450);
}

/* ---------- 탭 ---------- */
function switchTab(name) {
  if (['analyze', 'profile', 'tryon'].indexOf(name) === -1) name = 'analyze';
  state.tab = name;
  writeJSON(LS.tab, name);
  $$('.panel').forEach(p => p.classList.toggle('is-active', p.id === 'panel-' + name));
  $$('.tabbar__btn').forEach(b => {
    const on = b.getAttribute('data-tab') === name;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (name === 'profile') renderGuide();
  if (name === 'tryon') { drawFit(); syncFitControls(); }
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* ---------- OCR ---------- */
const OCR_STEPS = {
  'loading tesseract core': [2, 20, '인식 엔진 준비 중'],
  'initializing tesseract': [20, 26, '인식 엔진 초기화'],
  'loading language traineddata': [26, 46, '한국어 인식 데이터 내려받는 중'],
  'initializing api': [46, 54, '인식 준비'],
  'recognizing text': [54, 100, '글자 읽는 중'],
};

function setOcrProgress(pct, label) {
  const bar = $('#ocrProgressBar');
  const status = $('#ocrStatus');
  if (bar) bar.style.width = clamp(pct, 0, 100) + '%';
  if (status) status.textContent = Math.round(pct) + '% · ' + label;
}

function prepImageForOcr(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 1800;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const d = data.data;
        let min = 255;
        let max = 0;
        for (let i = 0; i < d.length; i += 4) {
          const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          d[i] = d[i + 1] = d[i + 2] = g;
          if (g < min) min = g;
          if (g > max) max = g;
        }
        const range = Math.max(1, max - min);
        for (let i = 0; i < d.length; i += 4) {
          let g = ((d[i] - min) * 255) / range;
          g = clamp((g - 128) * 1.22 + 128, 0, 255);
          d[i] = d[i + 1] = d[i + 2] = g;
        }
        ctx.putImageData(data, 0, 0);
        URL.revokeObjectURL(url);
        resolve(cv);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

async function runOcr() {
  if (!state.ocrFile) return;
  if (!window.Tesseract) {
    toast('인식 엔진을 불러오지 못했어요. 잠시 뒤 다시 시도하거나 텍스트로 붙여넣어 주세요.');
    return;
  }
  const btn = $('#ocrRun');
  const label = btn ? $('.btn__label', btn) : null;
  if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
  if (label) label.textContent = '읽는 중';
  const prog = $('#ocrProgress');
  if (prog) prog.hidden = false;
  setOcrProgress(2, '준비 중');

  let worker = null;
  try {
    const canvas = await prepImageForOcr(state.ocrFile);
    worker = await Tesseract.createWorker('kor+eng', 1, {
      logger: m => {
        const step = OCR_STEPS[m.status];
        if (!step) return;
        const pct = step[0] + (step[1] - step[0]) * (m.progress || 0);
        setOcrProgress(pct, step[2]);
      },
    });
    const res = await worker.recognize(canvas);
    const text = (res && res.data && res.data.text) || '';
    setOcrProgress(100, '완료');
    const parsed = parseChart(text, state.category);

    const paste = $('#pasteInput');
    if (paste && text.trim()) paste.value = text.trim();

    if (parsed.rows.length) {
      state.converted = parsed.converted;
      setRows(state.category, parsed.rows);
      toast(parsed.rows.length + '개 사이즈를 읽었어요. 숫자가 맞는지 확인해 주세요.');
      const card = $('#tableCard');
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      setMethod('paste');
      toast('표 구조를 찾지 못했어요. 읽은 글자를 붙여넣기 화면에 넣어 두었으니 고쳐 주세요.');
    }
  } catch (err) {
    setOcrProgress(0, '인식 실패');
    const msg = String((err && err.message) || err || '');
    toast('글자를 읽지 못했어요' + (msg ? ' (' + msg.slice(0, 40) + ')' : '') + '. 텍스트 붙여넣기를 써 보세요.');
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch (e) { /* ignore */ }
    }
    if (btn) { btn.disabled = !state.ocrFile; btn.classList.remove('is-busy'); }
    if (label) label.textContent = '글자 읽기 시작';
  }
}

function setOcrFile(file) {
  if (state.ocrUrl) { URL.revokeObjectURL(state.ocrUrl); state.ocrUrl = null; }
  state.ocrFile = file || null;
  const preview = $('#ocrPreview');
  const img = $('#ocrPreviewImg');
  const run = $('#ocrRun');
  const prog = $('#ocrProgress');
  if (prog) prog.hidden = true;
  if (!file) {
    if (preview) preview.hidden = true;
    if (img) img.removeAttribute('src');
    if (run) run.disabled = true;
    return;
  }
  state.ocrUrl = URL.createObjectURL(file);
  if (img) img.src = state.ocrUrl;
  if (preview) preview.hidden = false;
  if (run) run.disabled = false;
}

function setMethod(method) {
  state.method = method;
  $$('.seg__btn').forEach(b => {
    const on = b.getAttribute('data-method') === method;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $$('.method').forEach(m => m.classList.toggle('is-on', m.id === 'method-' + method));
}

/* ============================================================
   Part C: events, try-on canvas, boot
   ============================================================ */

/* ---------- 사이즈표 편집 이벤트 ---------- */
function bindTableEvents() {
  const tbody = $('#sizeTbody');
  if (!tbody) return;

  tbody.addEventListener('input', e => {
    const input = e.target;
    if (!input || !input.classList || !input.classList.contains('cell-input')) return;
    const row = currentRows().find(r => r.id === input.getAttribute('data-row'));
    if (!row) return;
    const key = input.getAttribute('data-key');

    if (key === '__size') {
      row.size = input.value.trim();
      saveRows();
      renderResults();
      return;
    }

    if (key === '__memo') {
      row.memo = input.value.slice(0, 200);
      saveRows();
      renderResults();
      return;
    }

    const raw = input.value.trim();
    if (!raw) {
      delete row.values[key];
      input.classList.remove('is-bad');
      saveRows();
      renderResults();
      return;
    }
    const n = parseNum(raw);
    if (n === null || n <= 0 || n > 300) {
      input.classList.add('is-bad');
      return;
    }
    input.classList.remove('is-bad');
    row.values[key] = n;
    saveRows();
    renderResults();
  });

  tbody.addEventListener('click', e => {
    const btn = e.target.closest ? e.target.closest('.del-row') : null;
    if (!btn) return;
    const id = btn.getAttribute('data-del');
    const rows = currentRows().filter(r => r.id !== id);
    state.rows[state.category] = rows;
    saveRows();
    renderTable();
    renderResults();
    renderCharts();
  });
}

function addRow() {
  const rows = currentRows();
  rows.push({ id: uid(), size: '', values: {} });
  saveRows();
  renderTable();
  renderResults();
  const inputs = $$('#sizeTbody .cell-input--size');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function seedRows() {
  const existing = currentRows();
  if (existing.length && !window.confirm('지금 표를 새 빈 표로 바꿀까요?')) return;
  const sizes = state.category === 'bottom'
    ? ['30', '32', '34', '36']
    : state.category === 'shirt'
      ? ['100', '105', '110']
      : state.category === 'shoe'
        ? ['250', '255', '260', '265', '270', '275']
        : ['M', 'L', 'XL', '2XL'];
  setRows(state.category, sizes.map(s => ({ id: uid(), size: s, values: {} })));
  const inputs = $$('#sizeTbody .cell-input');
  if (inputs.length) inputs[1] ? inputs[1].focus() : inputs[0].focus();
}

function clearRows() {
  if (!currentRows().length) return;
  if (!window.confirm('이 종류의 사이즈표를 모두 지울까요?')) return;
  state.converted = [];
  setRows(state.category, []);
}

function applyPaste() {
  const ta = $('#pasteInput');
  if (!ta) return;
  const parsed = parseChart(ta.value, state.category);
  if (!parsed.rows.length) {
    toast('표를 읽지 못했어요. 첫 줄에 사이즈·어깨 같은 열 이름이 있는지 확인해 주세요.');
    return;
  }
  state.converted = parsed.converted;
  setRows(state.category, parsed.rows);
  const chart = activeChart();
  let msg = parsed.rows.length + '개 사이즈를 표로 옮겼어요.';
  if (chart) msg += ' “' + chart.name + '”에 저장했어요.';
  if (parsed.converted.length) msg += ' 둘레 표기는 단면으로 환산했어요.';
  toast(msg);
  const card = $('#tableCard');
  if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- 백업 · 복원 ---------- */
function downloadFile(filename, text, mime) {
  try {
    const blob = new Blob([text], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 5000);
  } catch (e) {
    toast('파일을 만들지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
  }
}

function pad2(n) { return n < 10 ? '0' + n : String(n); }

function exportChartBackup() {
  saveRows();  // 화면에 남은 마지막 입력까지 저장한 뒤 내보낸다
  const payload = buildBackup(state.chartStore, state.profile);
  if (!payload.charts.length) {
    toast('아직 보관한 표가 없어요. 표를 먼저 만들어 주세요.');
    return;
  }
  const d = new Date();
  const ymd = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  downloadFile('size-fit-백업-' + ymd + '.json', JSON.stringify(payload, null, 2));
  const status = $('#backupStatus');
  if (status) status.textContent = '마지막 백업: ' + d.toLocaleString('ko-KR') + ' · 표 ' + payload.charts.length + '벌';
  toast('표 ' + payload.charts.length + '벌과 내 치수를 백업 파일로 내려받았어요.');
}

let modalActions = [];
let modalResolve = null;

function btnKindClass(kind) {
  if (kind === 'primary') return 'btn--primary';
  if (kind === 'danger') return 'btn--danger';
  return 'btn--ghost';
}

function openModal(opts) {
  const o = opts || {};
  const el = $('#backupModal');
  if (!el) return Promise.resolve(null);
  const title = $('#backupModalTitle');
  const body = $('#backupModalBody');
  const actions = $('#backupModalActions');
  if (title) title.textContent = o.title || '확인';
  if (body) body.innerHTML = o.html || '';
  modalActions = o.actions || [{ label: '확인', value: true, kind: 'primary' }];
  if (actions) {
    actions.innerHTML = modalActions.map((a, i) =>
      '<button type="button" class="btn ' + btnKindClass(a.kind) + '" data-modal-i="' + i + '">' +
      escapeHtml(a.label) + '</button>'
    ).join('');
  }
  el.hidden = false;
  return new Promise(resolve => { modalResolve = resolve; });
}

function closeModal(value) {
  const el = $('#backupModal');
  if (el) el.hidden = true;
  const r = modalResolve;
  modalResolve = null;
  if (r) r(value);
}

function onBackupModalClick(e) {
  const t = e.target;
  if (t.closest && t.closest('[data-modal-close]')) { closeModal(null); return; }
  const btn = t.closest ? t.closest('[data-modal-i]') : null;
  if (!btn) return;
  const i = Number(btn.getAttribute('data-modal-i'));
  const action = modalActions[i];
  closeModal(action ? (action.value === undefined ? null : action.value) : null);
}

function importChartBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let payload;
    try {
      payload = readBackup(JSON.parse(String(reader.result || '')));
    } catch (e) {
      toast((e && e.message) || '백업 파일을 읽지 못했어요.');
      return;
    }
    if (!payload.charts.length) {
      toast('복원할 표가 없어요.');
      return;
    }
    const when = payload.exportedAt ? new Date(payload.exportedAt) : null;
    const whenText = (when && !isNaN(when.getTime())) ? when.toLocaleString('ko-KR') : '날짜 없음';
    const chartList = payload.charts.slice(0, 6).map(c =>
      '<li>' + escapeHtml(CATEGORIES[c.category].name) + ' · ' + escapeHtml(c.name) + ' (' + c.rows.length + '줄)</li>'
    ).join('');
    const more = payload.charts.length > 6 ? '<li>… 그 밖에 ' + (payload.charts.length - 6) + '벌</li>' : '';
    openModal({
      title: '백업 불러오기',
      html: '<p class="modal__meta">앱 <b>size-fit</b> · 저장 구조 v' + escapeHtml(String(payload.version)) +
        '<br>내보낸 날짜 <b>' + escapeHtml(whenText) + '</b>' +
        '<br>표 <b>' + payload.charts.length + '벌</b></p>' +
        '<ul class="modal__list">' + chartList + more + '</ul>' +
        (payload.warnings.length ? '<p class="modal__warn">' + payload.warnings.map(escapeHtml).join('<br>') + '</p>' : '') +
        '<p class="hint">합치기는 지금 표를 그대로 두고 백업의 표를 더해요. 덮어쓰기는 지금 표를 모두 지우고 백업으로 바꿔요.</p>',
      actions: [
        { label: '합치기', value: 'merge', kind: 'primary' },
        { label: '덮어쓰기', value: 'replace', kind: 'ghost' },
        { label: '취소', value: null, kind: 'ghost' }
      ]
    }).then(mode => {
      if (!mode) return;
      if (mode === 'merge') { applyChartRestore(payload, 'merge'); return; }
      openModal({
        title: '정말 덮어쓸까요?',
        html: '<p class="modal__warn">지금 보관한 표 <b>' + state.chartStore.charts.length + '벌</b>과 내 치수가 백업 내용으로 바뀝니다. 되돌릴 수 없어요.</p>' +
          '<p class="hint">지금 표를 남기려면 취소를 누르고 <b>합치기</b>를 골라 주세요.</p>',
        actions: [
          { label: '덮어쓰기', value: 'replace', kind: 'danger' },
          { label: '취소', value: null, kind: 'ghost' }
        ]
      }).then(ok => {
        if (ok === 'replace') applyChartRestore(payload, 'replace');
      });
    });
  };
  reader.onerror = () => toast('파일을 읽지 못했어요.');
  reader.readAsText(file);
}

function applyChartRestore(payload, mode) {
  const result = mergeChartStores(state.chartStore, payload, mode);
  state.chartStore = result.store;
  if (mode === 'replace' && payload.profile) {
    state.profile = profileFromBackup(payload.profile, state.profile);
    writeJSON(LS.profile, state.profile);
  }
  syncRowsFromCharts();
  persistChartStore();
  renderCharts();
  renderTable();
  renderResults();
  renderBasis();
  renderPresets();
  renderProfileForm();
  renderHeader();
  renderGuide();
  const bits = [];
  if (result.added) bits.push(result.added + '벌 추가');
  if (result.updated) bits.push(result.updated + '벌 갱신');
  if (result.skipped) bits.push(result.skipped + '벌 그대로');
  toast('복원했어요' + (bits.length ? ' · ' + bits.join(', ') : ''));
  if (result.warnings.length) toast(result.warnings[0]);
}

/* ---------- 피팅 ---------- */
function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img: img, url: url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

function setPickerThumb(kind, url) {
  const thumb = $(kind === 'bg' ? '#meThumb' : '#garmentThumb');
  const picker = $(kind === 'bg' ? '#pickerMe' : '#pickerGarment');
  const sub = $(kind === 'bg' ? '#meSub' : '#garmentSub');
  if (thumb) {
    thumb.innerHTML = '<img src="' + url + '" alt="" style="object-fit:' +
      (kind === 'bg' ? 'cover' : 'contain') + '" />';
  }
  if (picker) picker.classList.add('is-set');
  if (sub) sub.textContent = kind === 'bg' ? '다른 사진으로 바꾸기' : '다른 옷으로 바꾸기';
}

async function loadFitImage(kind, file) {
  if (!file) return;
  try {
    const loaded = await readImageFile(file);
    const f = state.fit;
    if (kind === 'bg') {
      if (f.bgUrl) URL.revokeObjectURL(f.bgUrl);
      f.bg = loaded.img;
      f.bgUrl = loaded.url;
    } else {
      if (f.garmentUrl) URL.revokeObjectURL(f.garmentUrl);
      f.garment = loaded.img;
      f.garmentUrl = loaded.url;
      const cv = $('#tryonCanvas');
      if (cv) {
        f.baseScale = Math.min((cv.width * 0.66) / loaded.img.width, (cv.height * 0.46) / loaded.img.height);
        f.scale = 1;
        f.x = 0;
        f.y = -20;
        f.rot = 0;
        f.flip = false;
      }
    }
    f.ready = !!(f.bg && f.garment);
    setPickerThumb(kind, loaded.url);
    const wrap = $('#stageWrap');
    if (wrap && (f.bg || f.garment)) wrap.classList.add('is-ready');
    syncFitControls();
    drawFit();
  } catch (e) {
    toast('사진을 불러오지 못했어요. 다른 사진으로 시도해 주세요.');
  }
}

function drawCover(ctx, img, w, h) {
  const ratio = Math.max(w / img.width, h / img.height);
  const dw = img.width * ratio;
  const dh = img.height * ratio;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawFit() {
  const cv = $('#tryonCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const f = state.fit;
  ctx.clearRect(0, 0, cv.width, cv.height);

  if (f.bg) {
    drawCover(ctx, f.bg, cv.width, cv.height);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, cv.height);
    grad.addColorStop(0, '#f0ede5');
    grad.addColorStop(1, '#e4e0d5');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }

  if (f.garment) {
    const g = f.garment;
    const s = f.baseScale * f.scale;
    ctx.save();
    ctx.globalAlpha = f.opacity;
    ctx.translate(cv.width / 2 + f.x, cv.height / 2 + f.y);
    ctx.rotate((f.rot * Math.PI) / 180);
    ctx.scale(f.flip ? -s : s, s);
    ctx.drawImage(g, -g.width / 2, -g.height / 2);
    ctx.restore();
  }
}

function fillTrack(el) {
  if (!el) return;
  const min = parseFloat(el.min) || 0;
  const max = parseFloat(el.max) || 100;
  const val = parseFloat(el.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;
  el.style.setProperty('--fill', clamp(pct, 0, 100) + '%');
}

function syncFitControls() {
  const f = state.fit;
  const scale = $('#scaleRange');
  const rot = $('#rotateRange');
  const op = $('#opacityRange');
  if (scale) { scale.value = String(Math.round(f.scale * 100)); fillTrack(scale); }
  if (rot) { rot.value = String(Math.round(f.rot)); fillTrack(rot); }
  if (op) { op.value = String(Math.round(f.opacity * 100)); fillTrack(op); }
  const sv = $('#scaleVal'); if (sv) sv.textContent = Math.round(f.scale * 100) + '%';
  const rv = $('#rotateVal'); if (rv) rv.textContent = Math.round(f.rot) + '°';
  const ov = $('#opacityVal'); if (ov) ov.textContent = Math.round(f.opacity * 100) + '%';
}

function resetFit() {
  const f = state.fit;
  f.x = 0; f.y = -20; f.scale = 1; f.rot = 0; f.opacity = 0.92; f.flip = false;
  syncFitControls();
  drawFit();
}

function saveFitPng() {
  const f = state.fit;
  if (!f.bg || !f.garment) {
    toast('내 사진과 옷 사진을 모두 고르면 저장할 수 있어요.');
    return;
  }
  const cv = $('#tryonCanvas');
  if (!cv) return;
  const now = new Date();
  const pad = n => (n < 10 ? '0' + n : String(n));
  const name = 'size-fit-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
    '-' + pad(now.getHours()) + pad(now.getMinutes()) + '.png';
  const triggerDownload = (href) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  try {
    if (cv.toBlob) {
      cv.toBlob(blob => {
        if (!blob) { toast('이미지를 만들지 못했어요.'); return; }
        const url = URL.createObjectURL(blob);
        triggerDownload(url);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast('피팅 이미지를 저장했어요. 사진 앱이나 파일에서 확인하세요.');
      }, 'image/png');
    } else {
      triggerDownload(cv.toDataURL('image/png'));
      toast('피팅 이미지를 저장했어요.');
    }
  } catch (e) {
    toast('저장하지 못했어요. 사진을 다시 불러와 보세요.');
  }
}

function bindTryon() {
  const meInput = $('#meInput');
  const garmentInput = $('#garmentInput');
  if (meInput) meInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (file) loadFitImage('bg', file);
  });
  if (garmentInput) garmentInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (file) loadFitImage('garment', file);
  });

  const cv = $('#tryonCanvas');
  if (cv) {
    const pointers = new Map();
    let startDist = 0;
    let startScale = 1;

    cv.addEventListener('pointerdown', e => {
      if (!state.fit.bg && !state.fit.garment) return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const p = Array.from(pointers.values());
        startDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        startScale = state.fit.scale;
      }
    });

    cv.addEventListener('pointermove', e => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      e.preventDefault();
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = cv.getBoundingClientRect();
      const k = rect.width ? cv.width / rect.width : 1;
      if (pointers.size === 1) {
        state.fit.x += dx * k;
        state.fit.y += dy * k;
      } else if (pointers.size >= 2) {
        const p = Array.from(pointers.values());
        const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (startDist > 4) state.fit.scale = clamp(startScale * (dist / startDist), 0.2, 2.6);
        state.fit.x += dx * k * 0.5;
        state.fit.y += dy * k * 0.5;
      }
      drawFit();
      syncFitControls();
    });

    const endPointer = e => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) startDist = 0;
    };
    cv.addEventListener('pointerup', endPointer);
    cv.addEventListener('pointercancel', endPointer);
    cv.addEventListener('wheel', e => {
      if (!state.fit.garment) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.06 : 0.94;
      state.fit.scale = clamp(state.fit.scale * factor, 0.2, 2.6);
      drawFit();
      syncFitControls();
    }, { passive: false });
  }

  const scale = $('#scaleRange');
  if (scale) scale.addEventListener('input', () => {
    state.fit.scale = clamp((parseFloat(scale.value) || 100) / 100, 0.2, 2.6);
    fillTrack(scale);
    const v = $('#scaleVal'); if (v) v.textContent = Math.round(state.fit.scale * 100) + '%';
    drawFit();
  });
  const rot = $('#rotateRange');
  if (rot) rot.addEventListener('input', () => {
    state.fit.rot = parseFloat(rot.value) || 0;
    fillTrack(rot);
    const v = $('#rotateVal'); if (v) v.textContent = Math.round(state.fit.rot) + '°';
    drawFit();
  });
  const op = $('#opacityRange');
  if (op) op.addEventListener('input', () => {
    state.fit.opacity = clamp((parseFloat(op.value) || 92) / 100, 0.2, 1);
    fillTrack(op);
    const v = $('#opacityVal'); if (v) v.textContent = Math.round(state.fit.opacity * 100) + '%';
    drawFit();
  });

  const flip = $('#flipBtn');
  if (flip) flip.addEventListener('click', () => {
    state.fit.flip = !state.fit.flip;
    drawFit();
    toast(state.fit.flip ? '옷을 좌우로 뒤집었어요.' : '원래 방향으로 돌렸어요.');
  });
  const center = $('#centerBtn');
  if (center) center.addEventListener('click', () => {
    state.fit.x = 0;
    state.fit.y = -20;
    drawFit();
  });
  const reset = $('#resetFitBtn');
  if (reset) reset.addEventListener('click', () => { resetFit(); toast('옷 위치를 초기화했어요.'); });
  const save = $('#savePngBtn');
  if (save) save.addEventListener('click', saveFitPng);
}

/* ---------- 전체 이벤트 ---------- */
function bindEvents() {
  // 탭
  $$('.tabbar__btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });
  $$('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-goto')));
  });
  const headProfile = $('#headerProfileBtn');
  if (headProfile) headProfile.addEventListener('click', () => switchTab('profile'));

  // 카테고리
  $$('#categoryChips .chip').forEach(chip => {
    chip.addEventListener('click', () => selectCategory(chip.getAttribute('data-cat')));
  });

  // 보관한 표(여러 벌)
  const chartSel = $('#chartSelect');
  if (chartSel) chartSel.addEventListener('change', () => selectChart(chartSel.value));
  const chartNew = $('#chartNewBtn');
  if (chartNew) chartNew.addEventListener('click', () => createChart());
  const chartRename = $('#chartRenameBtn');
  if (chartRename) chartRename.addEventListener('click', renameChart);
  const chartDup = $('#chartDupBtn');
  if (chartDup) chartDup.addEventListener('click', duplicateChart);
  const chartDel = $('#chartDeleteBtn');
  if (chartDel) chartDel.addEventListener('click', deleteChart);
  const chartMemoInput = $('#chartMemo');
  if (chartMemoInput) chartMemoInput.addEventListener('input', () => commitChartMemo(chartMemoInput.value));

  // 백업 · 복원
  const backupExport = $('#backupExportBtn');
  if (backupExport) backupExport.addEventListener('click', exportChartBackup);
  const backupImportBtn = $('#backupImportBtn');
  if (backupImportBtn) backupImportBtn.addEventListener('click', () => {
    const input = $('#backupImportInput');
    if (input) { input.value = ''; input.click(); }
  });
  const backupInput = $('#backupImportInput');
  if (backupInput) backupInput.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) importChartBackupFile(f);
  });
  const backupModal = $('#backupModal');
  if (backupModal) backupModal.addEventListener('click', onBackupModalClick);

  // 입력 방식
  $$('.seg__btn').forEach(btn => {
    btn.addEventListener('click', () => setMethod(btn.getAttribute('data-method')));
  });

  // OCR
  const ocrInput = $('#ocrInput');
  if (ocrInput) ocrInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    setOcrFile(file || null);
  });
  const ocrClear = $('#ocrClear');
  if (ocrClear) ocrClear.addEventListener('click', () => {
    const inp = $('#ocrInput');
    if (inp) inp.value = '';
    setOcrFile(null);
  });
  const ocrRun = $('#ocrRun');
  if (ocrRun) ocrRun.addEventListener('click', runOcr);

  // 붙여넣기
  const parseBtn = $('#parseBtn');
  if (parseBtn) parseBtn.addEventListener('click', applyPaste);
  const sampleBtn = $('#samplePasteBtn');
  if (sampleBtn) sampleBtn.addEventListener('click', () => {
    const ta = $('#pasteInput');
    if (!ta) return;
    ta.value = sampleTextFor(state.category);
    ta.focus();
    toast('샘플 표를 넣었어요. 표로 변환을 눌러 주세요.');
  });

  // 직접 입력
  const manualSeed = $('#manualSeed');
  if (manualSeed) manualSeed.addEventListener('click', seedRows);
  const addBtn = $('#addRowBtn');
  if (addBtn) addBtn.addEventListener('click', addRow);
  const clearBtn = $('#clearRowsBtn');
  if (clearBtn) clearBtn.addEventListener('click', clearRows);
  bindTableEvents();

  // 샘플 프리셋
  const presets = $('#presetRow');
  if (presets) presets.addEventListener('click', e => {
    const btn = e.target.closest ? e.target.closest('[data-preset]') : null;
    if (btn) loadPreset(btn.getAttribute('data-preset'));
  });

  // 프로필 기본 정보
  const bindNum = (sel, key) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('input', () => {
      const n = parseFloat(String(el.value).replace(',', '.'));
      if (isFinite(n) && n > 0) state.profile[key] = n;
      renderHero();
      renderBasis();
      renderResults();
      scheduleSave();
    });
    el.addEventListener('blur', () => {
      const n = parseFloat(String(el.value).replace(',', '.'));
      if (!isFinite(n) || n <= 0) {
        state.profile[key] = DEFAULT_PROFILE[key];
        el.value = fmt(DEFAULT_PROFILE[key]);
      }
      renderHero(); renderBasis(); renderResults(); renderGuide(); scheduleSave();
    });
  };
  bindNum('#inHeight', 'height');
  bindNum('#inWeight', 'weight');
  bindNum('#inWaist', 'waistInch');

  const topSize = $('#inTopSize');
  if (topSize) topSize.addEventListener('input', () => {
    state.profile.topSize = topSize.value.trim();
    renderHeader();
    renderHero();
    scheduleSave();
  });

  const measureGrid = $('#measureGrid');
  if (measureGrid) {
    measureGrid.addEventListener('input', e => {
      const el = e.target;
      if (!el || !el.classList || !el.classList.contains('measure-input')) return;
      const key = el.getAttribute('data-measure');
      const raw = el.value.trim();
      if (!raw) {
        state.profile.measure[key] = null;
      } else {
        const n = parseFloat(raw.replace(',', '.'));
        if (!isFinite(n) || n <= 0) return;
        state.profile.measure[key] = n;
      }
      renderHero();
      renderBasis();
      renderResults();
      scheduleSave();
    });
    measureGrid.addEventListener('change', () => renderGuide());
  }

  const resetProfile = $('#resetProfileBtn');
  if (resetProfile) resetProfile.addEventListener('click', () => {
    if (!window.confirm('내 치수를 처음 값으로 되돌릴까요?')) return;
    state.profile = clone(DEFAULT_PROFILE);
    persistProfile();
    renderProfileForm();
    renderHeader();
    renderBasis();
    renderResults();
    renderGuide();
    toast('기본값으로 되돌렸어요.');
  });

  bindTryon();

  // 해시로 탭 열기
  window.addEventListener('hashchange', () => {
    const name = location.hash.replace('#', '');
    if (['analyze', 'profile', 'tryon'].indexOf(name) !== -1) switchTab(name);
  });
}

/* ---------- 시작 ---------- */
function init() {
  state.profile = loadProfile();

  // 옛 단일 표(sizefit.rows.v1)가 있으면 '기본 표' 한 벌로 감싸 새 보관함으로 옮긴다.
  // 옛 키는 지우지 않고, 앞으로도 지금 쓰는 표를 옛 모양으로 비춰 둔다.
  const legacyRows = readJSON(LS.rows, null);
  const storedCharts = readJSON(LS.charts, null);
  const loaded = loadChartStore(legacyRows, storedCharts);
  state.chartStore = loaded.store;
  syncRowsFromCharts();
  if (loaded.needsSave) persistChartStore();

  const savedCat = readJSON(LS.category, null);
  if (savedCat && CATEGORIES[savedCat]) state.category = savedCat;

  renderHeader();
  renderProfileForm();
  syncCategoryUI();
  renderBasis();
  renderPresets();
  renderCharts();
  renderTable();
  renderResults();
  renderGuide();
  bindEvents();
  if (loaded.migrated) {
    toast('예전에 쓰던 사이즈표를 “' + DEFAULT_CHART_NAME + '”으로 옮겨 보관했어요. 이제 여러 벌을 함께 둘 수 있어요.');
  }

  $$('input[type="range"]').forEach(fillTrack);

  const hashTab = location.hash.replace('#', '');
  const savedTab = readJSON(LS.tab, null);
  let tab = 'analyze';
  if (['analyze', 'profile', 'tryon'].indexOf(hashTab) !== -1) tab = hashTab;
  else if (['analyze', 'profile', 'tryon'].indexOf(savedTab) !== -1) tab = savedTab;
  switchTab(tab);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline install is optional */ });
    });
  }

  window.addEventListener('pagehide', () => {
    if (state.profile) writeJSON(LS.profile, state.profile);
    saveRows();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

