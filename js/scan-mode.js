/**
 * EthoLogger Scan Mode Module
 * Implements scan-sampling: drives the playhead in a jump/play/pause loop
 * (e.g. "every 60s play 5s, repeat"). Each played window is recorded
 * on the project as a scan window for audit and IRR.
 *
 * Depends on:
 *   - EthoLogger.Utils (utils.js)
 *   - EthoLogger.Store (store.js)
 *   - EthoLogger.Coder (coder.js) — for video element access
 */
(function () {
    'use strict';

    window.EthoLogger = window.EthoLogger || {};

    var generateId = EthoLogger.Utils.generateId;
    var formatTime = EthoLogger.Utils.formatTime;
    var showToast = EthoLogger.Utils.showToast;

    // ------------------------------------------------------------------
    // Module state
    // ------------------------------------------------------------------

    var STATE_IDLE = 'idle';
    var STATE_PLAYING = 'playing';
    var STATE_WAITING = 'waiting';

    var currentProject = null;
    var state = STATE_IDLE;
    var config = {
        intervalSec: 60,
        sampleSec: 5,
        behavior: 'auto'  // 'auto' | 'pause'
    };
    var nextStartSec = 0;       // The video time where the next sample begins
    var sampleEndSec = 0;       // When the current sample should end
    var sampleStartSec = 0;     // Start of the currently-playing sample
    var sampleTimerId = null;   // setTimeout for ending a sample
    var statusTickId = null;    // setInterval for status line refresh

    // DOM refs (resolved in init)
    var panel = null;
    var inputInterval = null;
    var inputSample = null;
    var radioAuto = null;
    var radioPause = null;
    var btnStart = null;
    var btnContinue = null;
    var statusEl = null;

    // ------------------------------------------------------------------
    // init / bind
    // ------------------------------------------------------------------

    function init(project) {
        currentProject = project;

        if (!currentProject.scanWindows) {
            currentProject.scanWindows = [];
        }

        panel = document.getElementById('panel-scan-mode');
        inputInterval = document.getElementById('input-scan-interval');
        inputSample = document.getElementById('input-scan-sample');
        radioAuto = document.getElementById('radio-scan-auto');
        radioPause = document.getElementById('radio-scan-pause');
        btnStart = document.getElementById('btn-scan-start');
        btnContinue = document.getElementById('btn-scan-continue');
        statusEl = document.getElementById('scan-status');

        if (!panel) return; // UI not present — nothing to bind

        _loadSavedConfig();
        _renderConfigToUi();
        _wireEvents();

        state = STATE_IDLE;
        _renderStatus();
    }

    function _loadSavedConfig() {
        var saved = (EthoLogger.Store.getSettings() || {}).scanMode;
        if (saved && typeof saved === 'object') {
            if (typeof saved.intervalSec === 'number' && saved.intervalSec > 0) {
                config.intervalSec = saved.intervalSec;
            }
            if (typeof saved.sampleSec === 'number' && saved.sampleSec > 0) {
                config.sampleSec = saved.sampleSec;
            }
            if (saved.behavior === 'auto' || saved.behavior === 'pause') {
                config.behavior = saved.behavior;
            }
        }
    }

    function _persistConfig() {
        EthoLogger.Store.updateSettings({ scanMode: {
            intervalSec: config.intervalSec,
            sampleSec: config.sampleSec,
            behavior: config.behavior
        }});
    }

    function _renderConfigToUi() {
        if (inputInterval) inputInterval.value = config.intervalSec;
        if (inputSample) inputSample.value = config.sampleSec;
        if (radioAuto) radioAuto.checked = (config.behavior === 'auto');
        if (radioPause) radioPause.checked = (config.behavior === 'pause');
    }

    function _readConfigFromUi() {
        if (inputInterval) {
            var iv = parseFloat(inputInterval.value);
            if (!isNaN(iv) && iv > 0) config.intervalSec = iv;
        }
        if (inputSample) {
            var sv = parseFloat(inputSample.value);
            if (!isNaN(sv) && sv > 0) config.sampleSec = sv;
        }
        if (radioPause && radioPause.checked) {
            config.behavior = 'pause';
        } else {
            config.behavior = 'auto';
        }
        _persistConfig();
    }

    function _wireEvents() {
        if (btnStart) {
            btnStart.addEventListener('click', function () {
                if (state === STATE_IDLE) {
                    start();
                } else {
                    stop();
                }
            });
        }
        if (btnContinue) {
            btnContinue.addEventListener('click', function () {
                continueNext();
            });
        }
        var inputs = [inputInterval, inputSample, radioAuto, radioPause];
        for (var i = 0; i < inputs.length; i++) {
            if (inputs[i]) {
                inputs[i].addEventListener('change', _readConfigFromUi);
            }
        }
    }

    // ------------------------------------------------------------------
    // State machine
    // ------------------------------------------------------------------

    function _getVideo() {
        return EthoLogger.Coder && EthoLogger.Coder.videoElement;
    }

    function start() {
        var video = _getVideo();
        if (!video || !video.src) {
            showToast('Load a video first');
            return;
        }
        _readConfigFromUi();

        // Default start point: current playhead
        nextStartSec = video.currentTime || 0;
        _runSampleAt(nextStartSec);
    }

    function stop() {
        _clearSampleTimer();
        var video = _getVideo();
        if (video && !video.paused) {
            video.pause();
            // Sync coder's play/pause UI state by deferring to its API.
            if (EthoLogger.Coder && typeof EthoLogger.Coder.togglePlayPause === 'function') {
                // togglePlayPause toggles, so only call if it would now play; instead
                // just update its module flag directly via setter.
                EthoLogger.Coder.isPlaying = false;
            }
            var playPauseBtn = document.getElementById('btn-play-pause');
            if (playPauseBtn) playPauseBtn.textContent = 'Play';
            if (EthoLogger.Coder && typeof EthoLogger.Coder.stopRenderLoop === 'function') {
                EthoLogger.Coder.stopRenderLoop();
            }
        }
        state = STATE_IDLE;
        _renderStatus();
    }

    function continueNext() {
        if (state !== STATE_WAITING) return;
        _runSampleAt(nextStartSec);
    }

    function isWaiting() {
        return state === STATE_WAITING;
    }

    function isActive() {
        return state !== STATE_IDLE;
    }

    /**
     * Seek to startSec, play, and schedule end-of-sample.
     */
    function _runSampleAt(startSec) {
        var video = _getVideo();
        if (!video) return;

        var duration = video.duration || (currentProject && currentProject.videoDuration) || 0;
        if (duration > 0 && startSec >= duration) {
            showToast('Scan complete — reached end of video');
            stop();
            return;
        }

        sampleStartSec = startSec;
        sampleEndSec = startSec + config.sampleSec;
        if (duration > 0 && sampleEndSec > duration) {
            sampleEndSec = duration;
        }

        video.currentTime = startSec;

        var playPromise = video.play();
        // Some browsers return a Promise; ignore rejections (autoplay policies).
        if (playPromise && typeof playPromise.then === 'function') {
            playPromise.catch(function () {});
        }

        if (EthoLogger.Coder) {
            EthoLogger.Coder.isPlaying = true;
            if (typeof EthoLogger.Coder.startRenderLoop === 'function') {
                EthoLogger.Coder.startRenderLoop();
            }
        }
        var playPauseBtn = document.getElementById('btn-play-pause');
        if (playPauseBtn) playPauseBtn.textContent = 'Pause';

        state = STATE_PLAYING;
        _renderStatus();

        _clearSampleTimer();
        var sampleDurationMs = (sampleEndSec - sampleStartSec) * 1000;
        sampleTimerId = setTimeout(_onSampleEnd, sampleDurationMs);
    }

    function _onSampleEnd() {
        sampleTimerId = null;
        var video = _getVideo();
        if (!video) return;

        // Pause and record the window
        video.pause();
        if (EthoLogger.Coder) {
            EthoLogger.Coder.isPlaying = false;
            if (typeof EthoLogger.Coder.stopRenderLoop === 'function') {
                EthoLogger.Coder.stopRenderLoop();
            }
        }
        var playPauseBtn = document.getElementById('btn-play-pause');
        if (playPauseBtn) playPauseBtn.textContent = 'Play';

        _recordWindow(sampleStartSec, video.currentTime);

        // Compute next sample start
        nextStartSec = sampleStartSec + config.intervalSec;
        var duration = video.duration || (currentProject && currentProject.videoDuration) || 0;

        if (duration > 0 && nextStartSec >= duration) {
            showToast('Scan complete');
            state = STATE_IDLE;
            _renderStatus();
            return;
        }

        if (config.behavior === 'auto') {
            _runSampleAt(nextStartSec);
        } else {
            state = STATE_WAITING;
            _renderStatus();
        }
    }

    function _recordWindow(startSec, endSec) {
        if (!currentProject) return;
        if (!currentProject.scanWindows) currentProject.scanWindows = [];
        currentProject.scanWindows.push({
            id: generateId('scan'),
            startSec: startSec,
            endSec: endSec,
            createdAt: new Date().toISOString()
        });
        EthoLogger.Store.autoSave(currentProject);
    }

    function _clearSampleTimer() {
        if (sampleTimerId !== null) {
            clearTimeout(sampleTimerId);
            sampleTimerId = null;
        }
    }

    // ------------------------------------------------------------------
    // Status line
    // ------------------------------------------------------------------

    function _renderStatus() {
        if (!statusEl) return;

        if (btnStart) {
            btnStart.textContent = (state === STATE_IDLE) ? 'Start scan' : 'Stop scan';
        }
        if (btnContinue) {
            btnContinue.style.display = (state === STATE_WAITING) ? '' : 'none';
        }

        if (statusTickId !== null) {
            clearInterval(statusTickId);
            statusTickId = null;
        }

        if (state === STATE_IDLE) {
            statusEl.textContent = 'Idle. Set interval and sample, then start.';
            return;
        }

        if (state === STATE_PLAYING) {
            // Tick to show countdown to end of sample
            statusTickId = setInterval(function () {
                var video = _getVideo();
                if (!video) return;
                var remaining = Math.max(0, sampleEndSec - video.currentTime);
                statusEl.textContent = 'Sampling ' + formatTime(sampleStartSec) +
                    '\u2013' + formatTime(sampleEndSec) +
                    ' \u2014 ' + remaining.toFixed(1) + 's left';
            }, 100);
            return;
        }

        if (state === STATE_WAITING) {
            statusEl.textContent = 'Paused. Next sample at ' + formatTime(nextStartSec) +
                '. Press Space or Continue.';
            return;
        }
    }

    // ------------------------------------------------------------------
    // destroy
    // ------------------------------------------------------------------

    function destroy() {
        _clearSampleTimer();
        if (statusTickId !== null) {
            clearInterval(statusTickId);
            statusTickId = null;
        }
        state = STATE_IDLE;
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    EthoLogger.ScanMode = {
        init: init,
        start: start,
        stop: stop,
        continueNext: continueNext,
        isWaiting: isWaiting,
        isActive: isActive,
        destroy: destroy,
        get config() { return config; }
    };
})();
