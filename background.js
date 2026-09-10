const DB_NAME = 'solo';
const STORE = 'settings';
const KEY = scene.storageKey;

const picker = document.querySelector('.picker');
const reset = document.querySelector('[data-action="reset"]');

// Storage
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const load = () => withStore('readonly', (s) => s.get(KEY));
const save = (blob) => withStore('readwrite', (s) => s.put(blob, KEY));
const clear = () => withStore('readwrite', (s) => s.delete(KEY));

// Apply
let url = null;

function applyBackground(blob) {
  if (url) URL.revokeObjectURL(url);
  url = blob ? URL.createObjectURL(blob) : null;
  scene.renderer?.load(url || scene.defaultImage);
  reset.hidden = !blob;
}

load().then((blob) => {
  if (!blob) return;
  applyBackground(blob);
  actions.classList.add('is-hidden');
}).catch(() => {});

// Controls
picker.addEventListener('change', async () => {
  const [file] = picker.files;
  if (!file) return;

  await save(file);
  applyBackground(file);
  picker.value = '';
});

reset.addEventListener('click', async () => {
  await clear();
  applyBackground(null);
});
