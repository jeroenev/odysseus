// PWA install affordance for Odysseus.
//
// The PWA pieces (manifest, service worker, icons) already exist; what was
// missing was a *discoverable* way to install. On Chromium the browser is the
// authority on installability: when the app qualifies it fires
// `beforeinstallprompt`, which we stash and surface as an in-app "Install"
// button. If that event never fires, the app is not considered installable by
// the browser (and the only menu option is "Add to Home screen" shortcut) — so
// this also doubles as the definitive installability signal.
//
// Platforms differ:
//   * Chromium (Android / desktop Chrome/Edge): `beforeinstallprompt` ->
//     in-app Install button that calls .prompt() on click.
//   * iOS Safari: no install event and no programmatic prompt. Show a one-time
//     hint pointing at Share -> Add to Home Screen (the only iOS path).
//
// The banner is appended to <body> (never inside a transformed modal, which
// would mis-position fixed UI) with its own scoped inline styles so it never
// touches style.css. It only appears when actually installable, and a
// dismissal is remembered so it does not nag.

const DISMISS_KEY = 'odysseus-install-dismissed';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isiOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    // iPadOS 13+ reports as a Mac; touch points disambiguate it.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isiOSSafari() {
  if (!isiOS()) return false;
  const ua = navigator.userAgent || '';
  // Other iOS browsers (Chrome=CriOS, Firefox=FxiOS, Edge=EdgiOS, Opera=OPiOS)
  // cannot add a standalone PWA — only Safari can, so only hint there.
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua);
}

function dismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
}
function remember() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* private mode */ }
}

let bannerEl = null;
function removeBanner() {
  if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
  bannerEl = null;
}

function buildBanner(text, actionLabel, onAction) {
  removeBanner();
  const wrap = document.createElement('div');
  wrap.id = 'odysseus-install-banner';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Install Odysseus');
  // Theme variables with hard fallbacks, so it blends in but never breaks if a
  // theme omits one.
  Object.assign(wrap.style, {
    position: 'fixed',
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
    zIndex: '2147483000',
    maxWidth: 'min(440px, calc(100vw - 24px))',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '12px',
    background: 'var(--panel, #21252b)',
    color: 'var(--fg, #e6e6e6)',
    border: '1px solid var(--border, rgba(255,255,255,0.14))',
    boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
    font: '14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif',
  });

  const msg = document.createElement('span');
  msg.textContent = text;
  msg.style.flex = '1';
  wrap.appendChild(msg);

  if (actionLabel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = actionLabel;
    Object.assign(btn.style, {
      flex: '0 0 auto',
      cursor: 'pointer',
      padding: '7px 14px',
      borderRadius: '8px',
      border: 'none',
      background: 'var(--brand-color, var(--red, #e06c75))',
      color: '#fff',
      fontWeight: '600',
      fontSize: '14px',
    });
    btn.addEventListener('click', onAction);
    wrap.appendChild(btn);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '\u00d7';
  Object.assign(close.style, {
    flex: '0 0 auto',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    fontSize: '20px',
    lineHeight: '1',
    opacity: '0.7',
    padding: '2px 4px',
  });
  close.addEventListener('click', () => { remember(); removeBanner(); });
  wrap.appendChild(close);

  document.body.appendChild(wrap);
  bannerEl = wrap;
  return wrap;
}

function init() {
  if (isStandalone()) return; // already installed / running as an app

  let deferredPrompt = null;

  // Chromium: intercept the install prompt and offer our own button instead.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (dismissed()) return;
    buildBanner('Install Odysseus as an app', 'Install', async () => {
      removeBanner();
      if (!deferredPrompt) return;
      try {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch (err) { /* gesture expired or already used */ }
      deferredPrompt = null;
    });
  });

  // Successful install (Chromium): clean up and stop offering.
  window.addEventListener('appinstalled', () => {
    remember();
    removeBanner();
    deferredPrompt = null;
  });

  // iOS Safari: no event exists, so show the manual Add-to-Home-Screen hint once.
  if (isiOSSafari() && !dismissed()) {
    buildBanner('Install Odysseus: tap the Share icon, then "Add to Home Screen".', null, null);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
