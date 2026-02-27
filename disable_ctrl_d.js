// ==UserScript==
// @name         Disable Ctrl+D (Global)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Prevent Ctrl+D from triggering bookmark dialog on all websites
// @author       You
// @match        *://*/*
// @run-at       document-start
// ==/UserScript==

(function () {
    document.addEventListener('keydown', function (e) {
        // Check for Ctrl + D (or Cmd + D on macOS)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            e.stopPropagation();
            console.log("Ctrl+D disabled by Tampermonkey script.");
        }
    }, true);
})();