const BRIDGE_URL = 'http://127.0.0.1:8471/lid';
const WHEEL_STEP = 1 / 1200;
const KEY_STEP = 0.05;

// Fold range
const FOLD_OPEN = 0;
const FOLD_CLOSED = 30;
const LID_FOLLOW = 32;
const COAST_S = 0.28;
const POLL_MS = 8;

const LID_VENDOR = 0x05AC;
const LID_PRODUCT = 0x8104;
const LID_USAGE_PAGE = 0x20;
const LID_USAGE = 0x8A;
const LID_FILTERS = [
  { vendorId: LID_VENDOR, productId: LID_PRODUCT, usagePage: LID_USAGE_PAGE, usage: LID_USAGE },
  { vendorId: LID_VENDOR, productId: LID_PRODUCT },
  { vendorId: LID_VENDOR, usagePage: LID_USAGE_PAGE, usage: LID_USAGE },
];
const ANGLE_REPORT = 1;

// Laptop: the lid angle drives the lid fold
function createLaptopScene(canvas) {
  const lidSheet = document.querySelector('.sheet--lid');
  const lidStatus = lidSheet.querySelector('.sheet__status');
  const allow = lidSheet.querySelector('[data-action="allow"]');
  const preview = lidSheet.querySelector('[data-action="preview"]');
  const renderer = createLid(canvas);
  const hid = navigator.hid;

  let target = 0;
  let display = 0;
  let open = FOLD_OPEN || null;
  let live = false;
  let hidDevice = null;
  let lastAngle = null;
  let lastSample = 0;
  let velocity = 0;
  let coasting = false;
  let pollTimer = 0;
  let streamLive = false;
  let streamSource = null;

  document.documentElement.classList.add(hid ? 'has-hid' : 'no-hid');

  function clamp(value) {
    return Math.min(1, Math.max(0, value));
  }

  function setStatus(text) {
    lidStatus.textContent = text;
    lidStatus.hidden = !text;
  }

  function begin(gesture) {
    if (lidSheet.open) lidSheet.close();
    if (live) {
      showHint(gesture);
      return;
    }
    live = true;
    hideUnavailable();
    onboard(() => showHint(gesture));
  }

  function foldOf(angle) {
    const top = FOLD_OPEN || open;
    if (!Number.isFinite(top) || top <= FOLD_CLOSED) return 0;
    return clamp((top - angle) / (top - FOLD_CLOSED));
  }

  function onAngle(angle, fromHid) {
    if (!Number.isFinite(angle)) return;
    if (fromHid && streamLive) return;
    const now = performance.now();
    if (fromHid && lastAngle != null && lastSample) {
      const dt = (now - lastSample) / 1000;
      if (dt > 0.001) velocity = (angle - lastAngle) / dt;
    } else {
      velocity = 0;
    }
    lastAngle = angle;
    lastSample = now;
    coasting = Boolean(fromHid);
    if (!FOLD_OPEN && (open === null || angle > open)) open = angle;
    target = foldOf(angle);
  }

  // Sensor
  function isLidSensor(device) {
    if (device.collections?.some((c) => c.usagePage === LID_USAGE_PAGE && c.usage === LID_USAGE)) {
      return true;
    }
    return device.vendorId === LID_VENDOR && device.productId === LID_PRODUCT;
  }

  function parseAngle(data) {
    const offset = data.byteLength > 2 && data.getUint8(0) === ANGLE_REPORT ? 1 : 0;
    if (data.byteLength < offset + 2) return NaN;
    let raw = data.getUint16(offset, true);
    if (raw > 360) raw /= 100;
    return raw;
  }

  function onReport(e) {
    if (e.reportId !== ANGLE_REPORT && e.reportId !== 0) return;
    onAngle(parseAngle(e.data), true);
  }

  function stopPoll() {
    clearTimeout(pollTimer);
    pollTimer = 0;
  }

  async function pollFeature() {
    if (!hidDevice?.opened) return;
    try {
      onAngle(parseAngle(await hidDevice.receiveFeatureReport(ANGLE_REPORT)), true);
    } catch {
      stopPoll();
      return;
    }
    pollTimer = setTimeout(pollFeature, POLL_MS);
  }

  async function listen(device, announce) {
    if (hidDevice && hidDevice !== device) {
      stopPoll();
      try { hidDevice.removeEventListener('inputreport', onReport); } catch { /* already gone */ }
      try { await hidDevice.close(); } catch { /* already closed */ }
    }
    if (!device.opened) await device.open();
    hidDevice = device;
    device.addEventListener('inputreport', onReport);
    try { await device.sendReport(6, Uint8Array.of(1)); } catch { /* no output */ }
    stopPoll();
    pollFeature();
    if (announce) begin('Close the lid slowly to fold the picture.');
  }

  async function pickSensor(candidates) {
    return candidates.find((device) => {
      return device.collections?.some((c) => c.usagePage === LID_USAGE_PAGE && c.usage === LID_USAGE);
    }) || candidates.find(isLidSensor);
  }

  async function reconnect() {
    if (!hid) return false;
    const device = await pickSensor(await hid.getDevices());
    if (!device) return false;
    await listen(device, false);
    return true;
  }

  async function allowSensor() {
    setStatus('');
    allow.disabled = true;
    try {
      const picked = await hid.requestDevice({ filters: LID_FILTERS });
      const device = await pickSensor([...(await hid.getDevices()), ...picked]);
      if (!device) {
        setStatus('No lid sensor was selected. It ships in MacBooks from 2019 on.');
        return;
      }
      await listen(device, true);
    } catch (error) {
      setStatus(error.message || 'The lid sensor could not be opened.');
    } finally {
      allow.disabled = false;
    }
  }

  // Stream
  function attachStream(source) {
    if (streamSource && streamSource !== source) {
      source.close();
      return;
    }
    streamSource = source;
    streamLive = true;
    coasting = false;
    setStatus('Lid stream connected.');
  }

  function onStreamMessage(source, e) {
    const angle = Number(e.data);
    if (!Number.isFinite(angle)) return;
    if (streamSource !== source) attachStream(source);
    streamLive = true;
    onAngle(angle, false);
  }

  function connectStream(url, persist) {
    const source = new EventSource(url);
    source.onmessage = (e) => onStreamMessage(source, e);
    source.onerror = () => {
      if (streamSource === source) streamLive = false;
      if (!persist && source.readyState !== EventSource.OPEN) source.close();
    };
  }

  function connectStreams() {
    const local = new URL('lid', location.href).href;
    connectStream(local, false);
    if (local !== BRIDGE_URL) connectStream(BRIDGE_URL, true);
  }

  // Preview
  window.addEventListener('wheel', (e) => {
    coasting = false;
    target = clamp(target + e.deltaY * WHEEL_STEP);
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    coasting = false;
    if (e.key === 'ArrowDown') target = clamp(target + KEY_STEP);
    if (e.key === 'ArrowUp') target = clamp(target - KEY_STEP);
  });

  if (hid) {
    hid.addEventListener('connect', (e) => {
      if (isLidSensor(e.device)) listen(e.device, false);
    });
  }

  allow.addEventListener('click', allowSensor);
  lidSheet.querySelector('[data-action="continue"]').addEventListener('click', () => {
    begin(streamLive
      ? 'Close the lid slowly to fold the picture.'
      : 'Scroll or use the arrow keys to fold the picture.');
  });
  preview.addEventListener('click', () => {
    begin('Scroll or use the arrow keys to fold the picture.');
  });

  lidSheet.addEventListener('cancel', (e) => e.preventDefault());

  return {
    defaultImage: 'backgrounds/default-mac.jpg',
    storageKey: 'background-mac',
    renderer,
    live: () => live,
    async start() {
      lidSheet.showModal();
      connectStreams();
      await reconnect();
    },
    frame(dt) {
      if (coasting && lastAngle != null) {
        const age = (performance.now() - lastSample) / 1000;
        target = foldOf(lastAngle + velocity * Math.min(age, COAST_S));
      }
      display += (target - display) * (1 - Math.exp(-dt * LID_FOLLOW));
      if (Math.abs(target - display) < 0.0001) display = target;
      renderer.draw(display);
    },
  };
}
