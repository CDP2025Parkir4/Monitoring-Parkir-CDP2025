// pages/parkiran_filkom/app.js
import '../../realtime.js';
import { getState, toggleSpot, getAvailableCount, subscribe } from '../../data/store.js';
const LOT_ID = 'dummy';

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

  // interaksi toggle
  document.getElementById('spotsGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.spot');
    if (!btn) return;
    const code = btn.dataset.id;
    try {
      toggleSpot(LOT_ID, code); // update state + broadcast
    } catch (err) {
      console.error('[dummy] toggleSpot failed:', err);
    }
    // Force re-hydrate so UI selalu pakai state terbaru.
    hydrateButtons();
    renderCount();
  });

  // kalau ada update dari halaman lain, refresh UI
  subscribe(() => {
    hydrateButtons();
    renderCount();
  });
});
