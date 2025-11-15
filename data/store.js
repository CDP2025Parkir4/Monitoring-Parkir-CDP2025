// store.js
const LS_KEY = 'parkingState';
const LOCAL_EVENT = 'parking-state-updated';
const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';

function createChannel() {
  if (!IS_BROWSER || typeof BroadcastChannel !== 'function') return null;
  try {
    return new BroadcastChannel('parking-sync');
  } catch (err) {
    console.warn('[store] BroadcastChannel unavailable, falling back to local events only:', err);
    return null;
  }
}

const CHANNEL = createChannel();

function createLocalEvent(updatedAt) {
  if (!IS_BROWSER) return null;
  if (typeof window.CustomEvent === 'function') {
    return new CustomEvent(LOCAL_EVENT, { detail: { updatedAt } });
  }
  if (typeof document.createEvent === 'function') {
    const event = document.createEvent('CustomEvent');
    event.initCustomEvent(LOCAL_EVENT, false, false, { updatedAt });
    return event;
  }
  return null;
}

function notifyLocal(updatedAt) {
  if (!IS_BROWSER) return;
  const event = createLocalEvent(updatedAt);
  if (event) window.dispatchEvent(event);
}

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
  CHANNEL?.postMessage({ type: 'state:updated', updatedAt: state.updatedAt });
  notifyLocal(state.updatedAt);
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
  const handler = () => onUpdate?.();
  if (CHANNEL) {
    CHANNEL.addEventListener('message', (e) => {
      if (e.data?.type === 'state:updated') handler();
    });
  }
  if (IS_BROWSER) {
    window.addEventListener('storage', (e) => {
      if (e.key === LS_KEY) handler();
    });
    window.addEventListener(LOCAL_EVENT, handler);
  }
}

function normalizeStatus(status) {
  const text = String(status ?? '').trim().toLowerCase();
  if (['occupied', 'penuh', 'terisi', 'full', 'taken'].includes(text)) return 'occupied';
  return 'available';
}

function normalizeLotId(entry, fallback) {
  return entry?.location || entry?.lotId || entry?.lot || fallback || null;
}

function normalizeSlotId(entry) {
  return entry?.slotId || entry?.slot || entry?.id || null;
}

function collectUpdates(payload, inheritedLot) {
  if (Array.isArray(payload)) {
    return payload.reduce((acc, item) => {
      acc.push(...collectUpdates(item, inheritedLot));
      return acc;
    }, []);
  }
  if (!payload || typeof payload !== 'object') return [];
  const lotId = normalizeLotId(payload, inheritedLot);
  if (Array.isArray(payload.slots)) {
    return payload.slots
      .map((slotEntry) => {
        if (!slotEntry || typeof slotEntry !== 'object') return null;
        return {
          lotId: normalizeLotId(slotEntry, lotId),
          slotId: normalizeSlotId(slotEntry),
          status: slotEntry?.status ?? slotEntry?.state,
        };
      })
      .filter(Boolean)
      .filter((item) => item.lotId && item.slotId);
  }
  const slotId = normalizeSlotId(payload);
  if (lotId && slotId) {
    return [{
      lotId,
      slotId,
      status: payload.status ?? payload.state,
    }];
  }
  return [];
}

function ensureLotRecord(state, lotId) {
  if (!state.lots[lotId]) {
    const blueprint = LOT_BLUEPRINTS[lotId];
    state.lots[lotId] = {
      name: blueprint?.name ?? lotId,
      spots: blueprint ? createSpots(blueprint.spots) : {},
    };
  }
  if (!state.lots[lotId].spots) {
    state.lots[lotId].spots = {};
  }
  return state.lots[lotId];
}

export function applyRemoteSnapshot(payload) {
  const updates = collectUpdates(payload);
  if (!updates.length) return;
  const state = loadState();
  let mutated = false;

  updates.forEach(({ lotId, slotId, status }) => {
    if (!lotId || !slotId) return;
    const lot = ensureLotRecord(state, lotId);
    const normalized = normalizeStatus(status);
    if (lot.spots[slotId] !== normalized) {
      lot.spots[slotId] = normalized;
      mutated = true;
    }
  });

  if (mutated) {
    saveState(state);
  }
}
