import '../../realtime.js';
import { getState, toggleSpot, getAvailableCount, subscribe } from '../../data/store.js';
const LOT_ID = 'feb1';

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
  getState();
  hydrateButtons();
  renderCount();

  document.getElementById('spotsGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.spot');
    if (!btn) return;
    const code = btn.dataset.id;
    toggleSpot(LOT_ID, code);

    btn.classList.toggle('available');
    btn.classList.toggle('occupied');
    renderCount();
  });

  subscribe(() => {
    hydrateButtons();
    renderCount();
  });
});
