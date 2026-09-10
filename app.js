const FOLLOW = 16;
const HINT_MS = 7000;
const INSTALL_DELAY_MS = 1200;
const INSTALL_KEY = 'install-shown';

const canvas = document.querySelector('.stage');
const actions = document.querySelector('.actions');
const hint = document.querySelector('.hint');
const unavailable = document.querySelector('.unavailable');
const status = unavailable.querySelector('.unavailable__status');
const retry = unavailable.querySelector('[data-action="retry"]');
const installSheet = document.querySelector('.sheet--install');
const fullscreen = document.querySelector('[data-action="fullscreen"]');

// Device
const params = new URLSearchParams(location.search);
const laptop = params.has('mode')
  ? params.get('mode') === 'laptop'
  : navigator.maxTouchPoints === 0 && matchMedia('(pointer: fine)').matches;

document.documentElement.classList.add(laptop ? 'is-laptop' : 'is-phone');

// Launch mode
const launchedAsApp = Boolean(navigator.standalone)
  || ['fullscreen', 'standalone', 'minimal-ui'].some((mode) => matchMedia(`(display-mode: ${mode})`).matches);

if (launchedAsApp) document.documentElement.classList.add('is-app');

// Hint
let hintTimer;

function showHint(text, ms = HINT_MS) {
  clearTimeout(hintTimer);
  hint.textContent = text;
  hint.hidden = false;
  if (ms) hintTimer = setTimeout(() => { hint.hidden = true; }, ms);
}

// Unavailable
function showUnavailable(message = '', onRetry = null) {
  document.querySelectorAll('.sheet[open]').forEach((sheet) => sheet.close());
  unavailable.hidden = false;
  status.textContent = message;
  status.hidden = !message;
  retry.hidden = !onRetry;
  retry.onclick = onRetry && (() => onRetry(true));
}

function hideUnavailable() {
  unavailable.hidden = true;
}

// Install guide (phones only)
function onboard(done) {
  if (laptop || launchedAsApp || localStorage.getItem(INSTALL_KEY)) {
    done();
    return;
  }

  installSheet.addEventListener('close', done, { once: true });
  setTimeout(() => {
    localStorage.setItem(INSTALL_KEY, '1');
    installSheet.showModal();
  }, INSTALL_DELAY_MS);
}

if (!document.fullscreenEnabled) fullscreen.textContent = 'Add to Home Screen';

fullscreen.addEventListener('click', async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else if (document.fullscreenEnabled) {
    await document.documentElement.requestFullscreen();
  } else {
    installSheet.showModal();
  }
});

document.addEventListener('fullscreenchange', () => {
  fullscreen.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
});

// Scene
const scene = laptop ? createLaptopScene(canvas) : createPhoneScene(canvas);

if (scene.renderer) {
  scene.renderer.load(scene.defaultImage);
  scene.start();
} else {
  showUnavailable('This browser has no WebGL 2.');
}

// Render loop
let lastTime = null;

function frame(time) {
  const dt = lastTime === null ? 1 / 60 : Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  if (scene.renderer) scene.frame(dt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Controls toggle
canvas.addEventListener('click', () => {
  if (!scene.live()) return;
  actions.classList.toggle('is-hidden');
});
