// ==UserScript==
// @name         Fastmail: Ctrl+Enter -> Click single strict "Going"
// @namespace    https://your.namespace.example
// @version      2.0.0
// @description  Simplest version: detect exactly one strict "Going" button and click it with Ctrl/Cmd+Enter.
// @match        https://app.fastmail.com/*
// @match        https://beta.fastmail.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_SELECTOR = 'button.s-event-going';
  const STRICT_GOING_RE = /^\s*going\s*$/i;

  let trackedBtn = null;

  function isTypingContext() {
    const a = document.activeElement;
    if (!a) return false;
    const tag = (a.tagName || '').toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      a.isContentEditable ||
      a.closest('[contenteditable="true"]')
    );
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getVisibleText(btn) {
    const label =
      btn.querySelector('.label .u-truncate, .label, .u-truncate') || btn;
    let t = (label.innerText || label.textContent || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return t;
  }

  function isStrictGoing(btn) {
    return STRICT_GOING_RE.test(getVisibleText(btn));
  }

  function updateTrackedButton() {
    const candidates = Array.from(
      document.querySelectorAll(BUTTON_SELECTOR)
    ).filter(isVisible);

    const strict = candidates.filter(isStrictGoing);

    if (strict.length === 1) {
      trackedBtn = strict[0];
    } else {
      trackedBtn = null;
    }
  }


  function showPopup(msg) {
      const d = document.createElement('div');
      d.textContent = msg;
      Object.assign(d.style, {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'white',
        color: 'black',
        padding: '24px 36px',     // 3× larger
        fontSize: '48px',         // 3× larger
        zIndex: 999999,
        opacity: 1,
        transition: 'opacity 0.2s'
      });
      document.body.appendChild(d);
      setTimeout(() => {
        d.style.opacity = 0;
        setTimeout(() => d.remove(), 200);
      }, 200);
  }

  function simulateClick(el) {
    try { el.focus(); } catch (_) {}
    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
    );
  }



  function handleShortcut(ev) {
    const isCtrlEnter =
      ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey);

    if (!isCtrlEnter) return;
    if (isTypingContext()) return;
    if (!trackedBtn || !trackedBtn.isConnected) return;

    ev.preventDefault();
    ev.stopPropagation();
    simulateClick(trackedBtn);
      showPopup("Going!");
  }

  window.addEventListener('keydown', handleShortcut, true);

  const mo = new MutationObserver(updateTrackedButton);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateTrackedButton, { once: true });
  } else {
    updateTrackedButton();
  }
})();