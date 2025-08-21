// src/components/common/DebugOverlayTamer.jsx
import React, { useEffect, useState } from 'react';

/**
 * Robust HUD tamer:
 *  - Finds the yellow debug HUD by text heuristics and tags it [data-dx-hud]
 *  - Pins it bottom-right with !important rules
 *  - External floating ⦿ button to collapse/hide regardless of HUD event traps
 *  - Hotkeys:
 *      Ctrl+Alt+D  collapse/expand
 *      Ctrl+Alt+H  hide/show
 *      Ctrl+Alt+R  reset flags
 *      Ctrl+Alt+X  disable tamer this session
 *  - Shift+Click ⦿  hide/show
 *  - Click ⦿        collapse/expand
 */

const LS = {
  collapsed: 'dx_hud_collapsed',
  hidden: 'dx_hud_hidden',
  disabled: 'dx_hud_disabled',
};

const get = (k, fallback = '0') => sessionStorage.getItem(k) ?? fallback;
const set = (k, v) => sessionStorage.setItem(k, v);

const ensureStyles = () => {
  if (document.getElementById('dx-hud-style')) return;
  const css = `
    /* pin + tame */
    [data-dx-hud]{
      position: fixed !important;
      right: 12px !important;
      bottom: 12px !important;
      z-index: 2147483646 !important;
      max-width: 360px !important;
      padding-right: 6px !important;
      pointer-events: auto !important;
    }
    /* collapsed: out of the way and non-blocking */
    [data-dx-hud][data-dx-collapsed="1"]{
      opacity: .14 !important;
      transform: translateY(0) !important;
      pointer-events: none !important; /* let clicks pass through */
    }
    /* hidden */
    [data-dx-hud][data-dx-hidden="1"]{
      display: none !important;
    }
    /* safety: never let it grow huge */
    [data-dx-hud]{ max-height: 40vh !important; overflow: auto !important; }
  `;
  const el = document.createElement('style');
  el.id = 'dx-hud-style';
  el.textContent = css;
  document.head.appendChild(el);
};

const matchesHUD = (el) => {
  if (!el || el.nodeType !== 1) return false;
  const t = String(el.textContent || '');
  return t.includes('Module:') && t.includes('Submodule:') && t.includes('Active Key:');
};

const findHUD = () => {
  const tagged = document.querySelector('[data-dx-hud]');
  if (tagged) return tagged;
  // scan last nodes first (HUDs are often appended late)
  const all = Array.from(document.body.querySelectorAll('*'));
  for (let i = all.length - 1; i >= 0; i--) {
    const el = all[i];
    if (matchesHUD(el)) return el;
  }
  return null;
};

const applyState = () => {
  const disabled = get(LS.disabled) === '1';
  const hud = findHUD();
  if (!hud) return;

  if (disabled) {
    hud.removeAttribute('data-dx-hud');
    hud.removeAttribute('data-dx-collapsed');
    hud.removeAttribute('data-dx-hidden');
    return;
  }

  hud.setAttribute('data-dx-hud', '1');
  hud.setAttribute('data-dx-collapsed', get(LS.collapsed));
  hud.setAttribute('data-dx-hidden', get(LS.hidden));
};

export default function DebugOverlayTamer() {
  const [, force] = useState(0); // re-render external ⦿ state only

  useEffect(() => {
    ensureStyles();
    applyState();

    // Observe DOM so if HUD remounts, we re-tag it
    const mo = new MutationObserver(() => applyState());
    mo.observe(document.body, { childList: true, subtree: true });

    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (!(e.ctrlKey && e.altKey)) return;

      if (k === 'd') { // collapse/expand
        e.preventDefault();
        set(LS.collapsed, get(LS.collapsed) === '1' ? '0' : '1');
        applyState(); force((n) => n + 1);
      } else if (k === 'h') { // hide/show
        e.preventDefault();
        set(LS.hidden, get(LS.hidden) === '1' ? '0' : '1');
        applyState(); force((n) => n + 1);
      } else if (k === 'r') { // reset
        e.preventDefault();
        sessionStorage.removeItem(LS.collapsed);
        sessionStorage.removeItem(LS.hidden);
        sessionStorage.removeItem(LS.disabled);
        applyState(); force((n) => n + 1);
      } else if (k === 'x') { // disable/enable tamer
        e.preventDefault();
        set(LS.disabled, get(LS.disabled) === '1' ? '0' : '1');
        applyState(); force((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      mo.disconnect();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const disabled = get(LS.disabled) === '1';
  const collapsed = get(LS.collapsed) === '1';
  const hidden = get(LS.hidden) === '1';

  const toggleCollapse = () => {
    set(LS.collapsed, collapsed ? '0' : '1');
    applyState();
    force((n) => n + 1);
  };
  const toggleHidden = () => {
    set(LS.hidden, hidden ? '0' : '1');
    applyState();
    force((n) => n + 1);
  };

  // external controller button (always above app)
  return (
    <button
      type="button"
      title={[
        '⦿ HUD controller',
        'Click: collapse/expand',
        'Shift+Click: hide/show',
        'Ctrl+Alt+D: collapse/expand',
        'Ctrl+Alt+H: hide/show',
        'Ctrl+Alt+R: reset flags',
        'Ctrl+Alt+X: disable tamer',
      ].join('\n')}
      onClick={(e) => (e.shiftKey ? toggleHidden() : toggleCollapse())}
      style={{
        position: 'fixed',
        right: 12,
        bottom: 56, // sits just above the HUD
        width: 28,
        height: 28,
        borderRadius: 18,
        border: '1px solid #777',
        background: disabled ? '#eee' : '#fff',
        color: '#222',
        zIndex: 2147483647,
        fontSize: 14,
        lineHeight: 1,
        display: 'grid',
        placeItems: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,.15)',
        cursor: 'pointer',
        opacity: hidden ? 0.6 : 1,
      }}
    >
      {disabled ? '×' : '⦿'}
    </button>
  );
}
