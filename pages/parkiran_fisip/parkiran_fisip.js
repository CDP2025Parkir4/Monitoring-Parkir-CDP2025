import '../../realtime.js';
import { getState, getAvailableCount, subscribe } from '../../data/store.js';
const LOT_ID = 'fisip';

function renderCount() {
  const el = document.getElementById('availableCount');
  if (el) el.textContent = getAvailableCount(LOT_ID);
}

function hydrateButtons() {
  const state = getState();
  const spots = state.lots[LOT_ID].spots;
  document.querySelectorAll('.spot').forEach(btn => {
    const code = btn.dataset.id;
    const status = spots[code] || 'available';
    btn.classList.toggle('available', status === 'available');
    btn.classList.toggle('occupied', status === 'occupied');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // pastikan state ada
  getState();

  // set tampilan awal
  hydrateButtons();
  renderCount();

  // kalau ada update dari halaman lain, refresh UI
  subscribe(() => {
    hydrateButtons();
    renderCount();
  });
});
