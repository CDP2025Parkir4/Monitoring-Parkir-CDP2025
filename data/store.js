// store.js
const LS_KEY = 'parkingState';
const CHANNEL = new BroadcastChannel('parking-sync');

const LOT_BLUEPRINTS = {
  filkom: { name: 'Parkiran Filkom', spots: 20 },
  fisip: { name: 'Parkiran Fisip', spots: 20 },
  sakri: { name: 'Samantha Krida', spots: 20 },
  ftp: { name: 'Fakultas Teknologi Pertanian', spots: 20 },
  fK: { name: 'Fakultas Kedokteran', spots: 20 },
  feb1: { name: 'Fakultas Ekonomi Bisnis (D)', spots: 20 },
  feb2: { name: 'Fakultas Ekonomi Bisnis (E)', spots: 20 },
  dummy: { name: 'Dummy', spots: 20 },
};

function createSpots(count) {
  const spots = {};
  for (let i = 1; i <= count; i += 1) {
    spots[`A${i}`] = 'available';
  }
  return spots;
}

function ensureLots(state) {
  let mutated = false;
  if (!state.lots) {
    state.lots = {};
    mutated = true;
  }
  Object.entries(LOT_BLUEPRINTS).forEach(([lotId, config]) => {
    if (!state.lots[lotId]) {
      state.lots[lotId] = { name: config.name, spots: createSpots(config.spots) };
      mutated = true;
      return;
    }
    const lot = state.lots[lotId];
    if (!lot.spots) {
      lot.spots = createSpots(config.spots);
      mutated = true;
      return;
    }
    for (let i = 1; i <= config.spots; i += 1) {
      const code = `A${i}`;
      if (!(code in lot.spots)) {
        lot.spots[code] = 'available';
        mutated = true;
      }
    }
  });
  if (!state.updatedAt) {
    state.updatedAt = Date.now();
    mutated = true;
  }
  return { state, mutated };
}

function loadState() {
  let state;
  let raw;
  try {
    raw = localStorage.getItem(LS_KEY);
    if (raw) state = JSON.parse(raw);
  } catch {
    state = undefined;
  }
  if (!state) {
    state = { lots: {}, updatedAt: Date.now() };
  }
  const { state: ensuredState, mutated } = ensureLots(state);
  if (!raw || mutated) {
    localStorage.setItem(LS_KEY, JSON.stringify(ensuredState));
  }
  return ensuredState;
}

function saveState(state) {
  state.updatedAt = Date.now();
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  // informasikan ke halaman lain
  CHANNEL.postMessage({ type: 'state:updated', updatedAt: state.updatedAt });
}

export function getState() {
  return loadState();
}

export function setSpot(lotId, spotCode, status /* 'available'|'occupied' */) {
  const state = loadState();
  if (!state.lots[lotId]) return;
  state.lots[lotId].spots[spotCode] = status;
  saveState(state);
}

export function toggleSpot(lotId, spotCode) {
  const state = loadState();
  if (!state.lots[lotId]) return;
  const cur = state.lots[lotId].spots[spotCode] || 'available';
  state.lots[lotId].spots[spotCode] = (cur === 'available') ? 'occupied' : 'available';
  saveState(state);
}

export function getAvailableCount(lotId) {
  const state = loadState();
  const spots = state.lots[lotId]?.spots || {};
  return Object.values(spots).filter(v => v === 'available').length;
}

export function subscribe(onUpdate) {
  // dipanggil ketika state berubah dari halaman lain
  CHANNEL.onmessage = (e) => {
    if (e.data?.type === 'state:updated') onUpdate?.();
  };
  // fallback kalau BroadcastChannel tidak ada (opsional):
  window.addEventListener('storage', (e) => {
    if (e.key === LS_KEY) onUpdate?.();
  });
}
