// home.js
import { getState, subscribe } from './data/store.js'; // sesuaikan path
import './realtime.js';

const lotCards = Array.from(document.querySelectorAll('.grid-cards .card'))
  .map((card) => ({
    card,
    lotId: card.dataset.lotId,
    countEl: card.querySelector('.count'),
    labelEl: card.querySelector('.avail small'),
    fillEl: card.querySelector('.fill'),
    availEl: card.querySelector('.avail'),
  }))
  .filter((entry) => entry.lotId);

function renderCard(entry, state) {
  const lot = state.lots?.[entry.lotId];
  const spots = lot?.spots || {};
  const totalSpots = Object.keys(spots).length;
  const available = Object.values(spots).filter((status) => status === 'available').length;
  const percent = totalSpots ? Math.round((available / totalSpots) * 100) : 0;

  if (entry.countEl) entry.countEl.textContent = available;
  if (entry.labelEl) entry.labelEl.textContent = totalSpots ? `of ${totalSpots} free` : 'No data';

  if (entry.fillEl) {
    entry.fillEl.style.setProperty('--p', percent);
    const hue = Math.max(0, Math.min(120, Math.round((percent / 100) * 120)));
    entry.fillEl.style.setProperty('background-color', `hsl(${hue} 70% 45%)`);
  }

  if (entry.availEl) {
    entry.availEl.classList.remove('ok', 'warn');
    entry.availEl.classList.add(percent < 30 ? 'warn' : 'ok');
  }
}

function render() {
  const state = getState();
  lotCards.forEach((entry) => renderCard(entry, state));
}

document.addEventListener('DOMContentLoaded', () => {
  // inisialisasi (buat default kalau belum ada)
  getState();
  render();
  // dengarkan update dari halaman lain
  subscribe(render);
});
