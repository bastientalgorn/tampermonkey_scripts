// ==UserScript==
// @name         Goodbudget Ctrl+Enter Save
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Press Ctrl+Enter to click the Save / Save Changes button on Goodbudget
// @match        https://goodbudget.com/*
// @match        https://www.goodbudget.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = '[Goodbudget Ctrl+Enter]';

    function log(...args) {
        console.log(LOG_PREFIX, ...args);
    }

    function describeElement(el) {
        if (!el) return 'null';
        const tag = el.tagName ? el.tagName.toLowerCase() : '?';
        const id = el.id ? '#' + el.id : '';
        const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().replace(/\s+/g, '.') : '';
        const text = el.textContent ? el.textContent.trim().slice(0, 40) : '';
        return `<${tag}${id}${cls}> "${text}"`;
    }

    // Finds the "Save Changes" button, but only if its class attribute is
    // EXACTLY "btn btn-success" (no extra classes like "hide"). This
    // deliberately excludes buttons such as:
    //   <button class="btn btn-success hide" id="addTransactionSaveConfirm">Save and Confirm</button>
    function getMatchingSaveButtons() {
        return Array.from(document.querySelectorAll('button.btn.btn-success#addTransactionSave'))
            .filter((btn) => btn.getAttribute('class') === 'btn btn-success');
    }

    log('Script loaded on:', window.location.href);

    document.addEventListener('keydown', function (e) {
        if (!e.ctrlKey || e.key !== 'Enter') {
            return;
        }

        console.log('%c--------------------------------------------------------------------', 'color: gray');
        const buttons = getMatchingSaveButtons();
        log(`Ctrl+Enter pressed. Found ${buttons.length} matching Save button(s):`);
        if (buttons.length) {
            console.table(buttons.map((btn, i) => ({
                index: i,
                element: describeElement(btn),
                class: btn.getAttribute('class'),
                id: btn.id,
            })));
        }

        // Only proceed if there is exactly 1 matching button
        if (buttons.length !== 1) {
            log('Aborting click: expected exactly 1 matching button, found', buttons.length, buttons);
            return;
        }

        const btn = buttons[0];
        e.preventDefault();

        // Some frameworks (e.g. jQuery/Backbone-style apps, which Goodbudget
        // resembles) only commit a field's typed value into their internal
        // model on "change"/"blur", not on every keystroke. If Save is
        // clicked while a field still has focus, the modal can close without
        // the last edit ever being saved. Blurring the active field first
        // (and dispatching input/change so the app notices) avoids that.
        const active = document.activeElement;
        if (active && active !== document.body && typeof active.blur === 'function') {
            log('Blurring active element before saving:', describeElement(active));
            active.dispatchEvent(new Event('input', { bubbles: true }));
            active.dispatchEvent(new Event('change', { bubbles: true }));
            active.blur(); // also triggers a native "blur" event
        } else {
            log('No active element to blur (or already document.body).');
        }

        // Give the app a brief moment to process the blur/change handlers
        // before we click Save.
        setTimeout(() => {
            log('Clicking Save button:', describeElement(btn));
            btn.click();
        }, 50);
    });
})();

