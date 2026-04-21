/**
 * EthoLogger Utilities Module
 * Foundational helper functions used throughout the application.
 */
(function () {
    'use strict';

    window.EthoLogger = window.EthoLogger || {};

    /**
     * Generate a short unique ID with a given prefix.
     * Example: generateId('b') -> "b_k8z3m2"
     */
    function generateId(prefix) {
        var random = Math.random().toString(36).substr(2, 6);
        return prefix + '_' + random;
    }

    /**
     * Format a number of seconds into "MM:SS.mmm" string.
     * Minutes can exceed 59 (no hours component).
     * Example: 72.5 -> "01:12.500", 3661.123 -> "61:01.123"
     */
    function formatTime(seconds) {
        if (seconds == null || isNaN(seconds)) {
            return '00:00.000';
        }
        var totalSeconds = Math.abs(seconds);
        var minutes = Math.floor(totalSeconds / 60);
        var secs = totalSeconds - minutes * 60;
        var wholeSeconds = Math.floor(secs);
        var millis = Math.round((secs - wholeSeconds) * 1000);

        // Handle rounding overflow: 999.5+ ms rounds to 1000
        if (millis >= 1000) {
            millis = 0;
            wholeSeconds += 1;
            if (wholeSeconds >= 60) {
                wholeSeconds = 0;
                minutes += 1;
            }
        }

        var mm = minutes < 10 ? '0' + minutes : '' + minutes;
        var ss = wholeSeconds < 10 ? '0' + wholeSeconds : '' + wholeSeconds;
        var mmm;
        if (millis < 10) {
            mmm = '00' + millis;
        } else if (millis < 100) {
            mmm = '0' + millis;
        } else {
            mmm = '' + millis;
        }

        return mm + ':' + ss + '.' + mmm;
    }

    /**
     * Standard debounce. Returns a wrapper that delays invoking fn
     * until ms milliseconds have elapsed since the last call.
     */
    function debounce(fn, ms) {
        var timerId = null;
        return function () {
            var context = this;
            var args = arguments;
            if (timerId !== null) {
                clearTimeout(timerId);
            }
            timerId = setTimeout(function () {
                timerId = null;
                fn.apply(context, args);
            }, ms);
        };
    }

    /**
     * Clamp a numeric value between min and max (inclusive).
     */
    function clamp(value, min, max) {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    /**
     * Trigger a file download in the browser by creating a temporary
     * anchor element with an object URL.
     */
    function downloadFile(content, filename, mimeType) {
        var blob = new Blob([content], { type: mimeType || 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Switch the visible view. Hides all elements with class "view",
     * then shows the element matching the given viewId by adding class "active".
     * Also updates the breadcrumb if one exists.
     */
    function showView(viewId) {
        var views = document.querySelectorAll('.view');
        for (var i = 0; i < views.length; i++) {
            views[i].classList.remove('active');
        }
        var target = document.getElementById(viewId);
        if (target) {
            target.classList.add('active');
        }

        // Update breadcrumb if the element exists
        var breadcrumb = document.getElementById('breadcrumb');
        if (breadcrumb && target) {
            var label = target.getAttribute('data-breadcrumb') || viewId;
            breadcrumb.textContent = label;
        }
    }

    /**
     * Show a small floating toast notification at the bottom-center of the
     * screen. It auto-fades and removes itself after durationMs (default 2000).
     */
    function showToast(message, durationMs) {
        var duration = durationMs || 2000;

        var toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;

        // Inline styles so this works without additional CSS dependencies
        toast.style.position = 'fixed';
        toast.style.bottom = '24px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.padding = '10px 20px';
        toast.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        toast.style.color = '#fff';
        toast.style.borderRadius = '6px';
        toast.style.fontSize = '14px';
        toast.style.zIndex = '10000';
        toast.style.opacity = '1';
        toast.style.transition = 'opacity 0.3s ease';
        toast.style.pointerEvents = 'none';

        document.body.appendChild(toast);

        setTimeout(function () {
            toast.style.opacity = '0';
            setTimeout(function () {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    }

    // Expose on the shared namespace
    EthoLogger.Utils = {
        generateId: generateId,
        formatTime: formatTime,
        debounce: debounce,
        clamp: clamp,
        downloadFile: downloadFile,
        showView: showView,
        showToast: showToast
    };
})();
