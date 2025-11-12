import { applyRemoteSnapshot } from './data/store.js';

const SOCKET_URL = (typeof window !== 'undefined' && window.REALTIME_SOCKET_URL) || 'http://localhost:5000';
const DETECTOR_EVENT = 'parking_status';
const FALLBACK_EVENT = 'parking_state_snapshot';
let socketPromise;
let loaderPromise;

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function loadSocketIO() {
  if (!isBrowser()) return Promise.reject(new Error('Socket.IO hanya tersedia di browser.'));
  if (window.io) return Promise.resolve(window.io);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
    script.async = true;
    script.onload = () => resolve(window.io);
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });

  return loaderPromise;
}

function handleIncoming(payload) {
  if (!payload) return;
  try {
    applyRemoteSnapshot(payload);
  } catch (err) {
    console.error('Gagal memproses data realtime:', err);
  }
}

export function initRealtime() {
  if (!isBrowser()) return Promise.resolve(null);
  if (socketPromise) return socketPromise;

  socketPromise = loadSocketIO()
    .then((ioLib) => {
      const socket = ioLib(SOCKET_URL, {
        transports: ['websocket'],
      });

      socket.on('connect', () => {
        console.info('[Realtime] Terhubung ke server');
        socket.emit('request_state');
      });
      socket.on('disconnect', (reason) => {
        console.warn('[Realtime] Terputus:', reason);
      });
      socket.on('connect_error', (err) => {
        console.error('[Realtime] Gagal terhubung:', err.message);
      });

      socket.on(DETECTOR_EVENT, handleIncoming);
      socket.on(FALLBACK_EVENT, handleIncoming);

      return socket;
    })
    .catch((err) => {
      console.error('Tidak bisa menginisiasi koneksi realtime:', err);
      return null;
    });

  return socketPromise;
}

initRealtime();
