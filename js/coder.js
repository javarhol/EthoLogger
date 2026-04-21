/**
 * OmniCoder Coder Module
 * Core video coding engine: video playback, keyboard-driven behavior coding,
 * and undo system. Handles the main coding workflow where users annotate
 * video with behavioral events.
 *
 * Depends on:
 *   - OmniCoder.Utils (utils.js)
 *   - OmniCoder.Store (store.js)
 *   - OmniCoder.Ethogram (ethogram.js)
 *   - VideoFrame (vendor/VideoFrame.min.js)
 *
 * Optional (called dynamically if available):
 *   - OmniCoder.Timeline
 *   - OmniCoder.Exporter
 */
(function () {
    'use strict';

    window.OmniCoder = window.OmniCoder || {};

    var generateId = OmniCoder.Utils.generateId;
    var formatTime = OmniCoder.Utils.formatTime;
    var showToast = OmniCoder.Utils.showToast;
    var clamp = OmniCoder.Utils.clamp;

    // ------------------------------------------------------------------
    // Module constants
    // ------------------------------------------------------------------

    var UNDO_STACK_MAX = 100;
    var FRAME_DURATION_FALLBACK = 1 / 30; // ~0.033s at 30fps
    var POINT_FLASH_DURATION = 300; // ms

    // ------------------------------------------------------------------
    // Module state
    // ------------------------------------------------------------------

    var currentProject = null;
    var activeStates = {};
    var videoElement = null;
    var videoFrame = null;
    var isPlaying = false;
    var animFrameId = null;

    // DOM references (populated in init)
    var seekBar = null;
    var timeDisplay = null;
    var playPauseBtn = null;
    var speedButtons = null;
    var frameBackBtn = null;
    var frameFwdBtn = null;
    var videoFileInput = null;
    var behaviorButtonsContainer = null;
    var annotationCountEl = null;
    var undoBtn = null;
    var exportCsvBtn = null;
    var helpOverlay = null;

    // Stored reference for keyboard handler so it can be removed in destroy()
    var _keydownHandler = null;

    // ------------------------------------------------------------------
    // init
    // ------------------------------------------------------------------

    /**
     * Main initialization. Sets up the coder view for a given project.
     * @param {Object} project - The active project object.
     */
    function init(project) {
        currentProject = project;

        // Ensure undo stack exists
        if (!currentProject.undoStack) {
            currentProject.undoStack = [];
        }

        // Ensure annotations array exists
        if (!currentProject.annotations) {
            currentProject.annotations = [];
        }

        // Reset module state
        activeStates = {};
        isPlaying = false;
        animFrameId = null;
        videoFrame = null;

        // ---- Grab DOM references ----
        videoElement = document.getElementById('video-player');
        seekBar = document.getElementById('seek-bar');
        timeDisplay = document.getElementById('video-time');
        playPauseBtn = document.getElementById('btn-play-pause');
        speedButtons = document.querySelectorAll('[data-speed]');
        frameBackBtn = document.getElementById('btn-frame-back');
        frameFwdBtn = document.getElementById('btn-frame-fwd');
        videoFileInput = document.getElementById('input-video-file');
        behaviorButtonsContainer = document.getElementById('behavior-buttons');
        annotationCountEl = document.getElementById('annotation-count');
        undoBtn = document.getElementById('btn-undo');
        exportCsvBtn = document.getElementById('btn-export-csv');
        helpOverlay = document.getElementById('help-overlay');

        // ---- Generate behavior buttons ----
        _renderBehaviorButtons();

        // ---- Set up all event listeners ----
        setupEventListeners();

        // ---- Re-activate open state events ----
        // Annotations with offset === null represent state events that were
        // started but not yet stopped (e.g. from a previous session that was
        // saved mid-recording).
        _reactivateOpenStates();

        // ---- Update annotation count display ----
        updateAnnotationCount();

        // ---- Update time display to initial state ----
        updateTimeDisplay();
    }

    // ------------------------------------------------------------------
    // Behavior button rendering
    // ------------------------------------------------------------------

    /**
     * Generate behavior buttons from the project ethogram and insert them
     * into the behavior-buttons container.
     */
    function _renderBehaviorButtons() {
        if (!behaviorButtonsContainer || !currentProject || !currentProject.ethogram) {
            return;
        }

        behaviorButtonsContainer.innerHTML = '';

        var behaviors = currentProject.ethogram.behaviors || [];

        for (var i = 0; i < behaviors.length; i++) {
            var behavior = behaviors[i];
            var btn = document.createElement('button');
            btn.className = 'behavior-btn';
            btn.setAttribute('data-behavior-id', behavior.id);
            btn.style.cssText = '--behavior-color: ' + behavior.color + '; background-color: ' + behavior.color;

            var keyBadge = document.createElement('span');
            keyBadge.className = 'key-badge';
            keyBadge.textContent = (behavior.key || '').toUpperCase();
            btn.appendChild(keyBadge);

            var nameSpan = document.createTextNode(' ' + behavior.name);
            btn.appendChild(nameSpan);

            // Closure to capture behavior reference
            (function (b) {
                btn.addEventListener('click', function () {
                    codeBehavior(b);
                });
            })(behavior);

            behaviorButtonsContainer.appendChild(btn);
        }
    }

    // ------------------------------------------------------------------
    // Re-activate open states
    // ------------------------------------------------------------------

    /**
     * Scan annotations for any state events with offset === null (open/ongoing)
     * and restore them into activeStates, highlighting their buttons.
     */
    function _reactivateOpenStates() {
        if (!currentProject || !currentProject.annotations) return;

        var annotations = currentProject.annotations;

        for (var i = 0; i < annotations.length; i++) {
            var ann = annotations[i];
            if (ann.type === 'state' && ann.offset === null) {
                activeStates[ann.behaviorId] = ann;

                var btn = getButtonForBehavior(ann.behaviorId);
                if (btn) {
                    btn.classList.add('active');
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // loadVideo
    // ------------------------------------------------------------------

    /**
     * Load a video file into the player.
     * @param {File} file - The video File object from a file input.
     */
    function loadVideo(file) {
        if (!file || !videoElement) return;

        var blobUrl = URL.createObjectURL(file);
        videoElement.src = blobUrl;
        currentProject.videoFileName = file.name;

        videoElement.onloadedmetadata = function () {
            currentProject.videoDuration = videoElement.duration;

            if (seekBar) {
                seekBar.max = videoElement.duration;
                seekBar.value = 0;
            }

            // Initialize VideoFrame.js for frame-accurate seeking
            try {
                videoFrame = new VideoFrame({
                    id: 'video-player',
                    frameRate: 30,
                    callback: function (response) {
                        // Callback required by VideoFrame constructor but we
                        // drive updates through our own render loop.
                    }
                });
            } catch (e) {
                console.warn('OmniCoder Coder: VideoFrame initialization failed', e);
                videoFrame = null;
            }

            updateTimeDisplay();
            OmniCoder.Store.autoSave(currentProject);
            showToast('Video loaded: ' + file.name);
        };

        videoElement.onerror = function () {
            showToast('Video format not supported. Try MP4 (H.264).');
        };
    }

    // ------------------------------------------------------------------
    // setupEventListeners
    // ------------------------------------------------------------------

    /**
     * Wire up all event handlers for the coder view: keyboard shortcuts,
     * transport controls, seek bar, video file input, etc.
     */
    function setupEventListeners() {
        // 1. Keyboard dispatch (global)
        _keydownHandler = function (e) {
            // Don't trigger codes when typing in form fields
            if (e.target.matches('input, textarea, select')) {
                return;
            }

            var isMod = e.ctrlKey || e.metaKey;
            var isAlt = e.altKey;

            // Allow Ctrl/Cmd+Z through for undo, block all other modifier combos
            if ((isMod || isAlt) && !(isMod && e.key.toLowerCase() === 'z')) {
                return;
            }

            var key = e.key;

            // Ctrl/Cmd + Z -> undo
            if (isMod && key.toLowerCase() === 'z') {
                e.preventDefault();
                undo();
                return;
            }

            switch (key) {
                case ' ':
                    e.preventDefault();
                    togglePlayPause();
                    return;

                case ',':
                    e.preventDefault();
                    frameBack();
                    return;

                case '.':
                    e.preventDefault();
                    frameForward();
                    return;

                case 'ArrowLeft':
                    e.preventDefault();
                    seek(-5);
                    return;

                case 'ArrowRight':
                    e.preventDefault();
                    seek(5);
                    return;

                case '?':
                    if (helpOverlay) {
                        helpOverlay.classList.toggle('active');
                    }
                    return;
            }

            // Behavior key mapping
            if (currentProject && currentProject.ethogram) {
                var keyMap = OmniCoder.Ethogram.getKeyMap(currentProject.ethogram);
                var lowerKey = key.toLowerCase();

                if (keyMap[lowerKey]) {
                    e.preventDefault();
                    codeBehavior(keyMap[lowerKey]);
                }
            }
        };

        document.addEventListener('keydown', _keydownHandler);

        // 2. Play/Pause button
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', function () {
                togglePlayPause();
            });
        }

        // 3. Speed buttons
        if (speedButtons) {
            for (var i = 0; i < speedButtons.length; i++) {
                (function (btn) {
                    btn.addEventListener('click', function () {
                        var speed = parseFloat(btn.getAttribute('data-speed'));
                        if (!isNaN(speed) && videoElement) {
                            videoElement.playbackRate = speed;
                        }

                        // Update active class across all speed buttons
                        for (var j = 0; j < speedButtons.length; j++) {
                            speedButtons[j].classList.remove('active');
                        }
                        btn.classList.add('active');
                    });
                })(speedButtons[i]);
            }
        }

        // 4. Frame step buttons
        if (frameBackBtn) {
            frameBackBtn.addEventListener('click', function () {
                frameBack();
            });
        }

        if (frameFwdBtn) {
            frameFwdBtn.addEventListener('click', function () {
                frameForward();
            });
        }

        // 5. Seek bar
        if (seekBar) {
            seekBar.addEventListener('input', function () {
                if (videoElement) {
                    videoElement.currentTime = parseFloat(seekBar.value);
                    updateTimeDisplay();
                }
            });
        }

        // 6. Video file input
        if (videoFileInput) {
            videoFileInput.addEventListener('change', function (e) {
                if (e.target.files && e.target.files[0]) {
                    loadVideo(e.target.files[0]);
                }
            });
        }

        // 7. Video timeupdate — keep seek bar and time display in sync during
        //    manual seeking or non-rAF playback scenarios
        if (videoElement) {
            videoElement.addEventListener('timeupdate', function () {
                if (seekBar) {
                    seekBar.value = videoElement.currentTime;
                }
                updateTimeDisplay();
            });
        }

        // 8. Undo button
        if (undoBtn) {
            undoBtn.addEventListener('click', function () {
                undo();
            });
        }

        // 9. Export CSV button
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', function () {
                if (OmniCoder.Exporter && OmniCoder.Exporter.exportCSV) {
                    OmniCoder.Exporter.exportCSV(currentProject);
                }
            });
        }
    }

    // ------------------------------------------------------------------
    // Transport controls
    // ------------------------------------------------------------------

    /**
     * Toggle between play and pause states.
     */
    function togglePlayPause() {
        if (!videoElement || !videoElement.src) {
            showToast('Load a video first');
            return;
        }

        if (videoElement.paused) {
            videoElement.play();
            isPlaying = true;
            if (playPauseBtn) {
                playPauseBtn.textContent = 'Pause';
            }
            startRenderLoop();
        } else {
            videoElement.pause();
            isPlaying = false;
            if (playPauseBtn) {
                playPauseBtn.textContent = 'Play';
            }
            stopRenderLoop();
        }
    }

    // ------------------------------------------------------------------
    // Render loop
    // ------------------------------------------------------------------

    /**
     * Start the requestAnimationFrame-based render loop for smooth
     * seek bar, time display, and timeline updates during playback.
     */
    function startRenderLoop() {
        // Prevent duplicate loops
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
        }

        function renderFrame() {
            if (seekBar && videoElement) {
                seekBar.value = videoElement.currentTime;
            }

            updateTimeDisplay();

            // Update timeline visualization if available
            if (OmniCoder.Timeline && typeof OmniCoder.Timeline.render === 'function' && videoElement) {
                OmniCoder.Timeline.render(
                    videoElement.currentTime,
                    currentProject.annotations,
                    (currentProject.ethogram && currentProject.ethogram.behaviors) || [],
                    videoElement.duration || currentProject.videoDuration || 0
                );
            }

            animFrameId = requestAnimationFrame(renderFrame);
        }

        animFrameId = requestAnimationFrame(renderFrame);
    }

    /**
     * Stop the render loop.
     */
    function stopRenderLoop() {
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
    }

    // ------------------------------------------------------------------
    // Seeking
    // ------------------------------------------------------------------

    /**
     * Seek the video by a relative number of seconds.
     * @param {number} deltaSec - Seconds to seek (positive = forward, negative = backward).
     */
    function seek(deltaSec) {
        if (!videoElement || !videoElement.duration) return;

        videoElement.currentTime = clamp(
            videoElement.currentTime + deltaSec,
            0,
            videoElement.duration
        );

        updateTimeDisplay();
    }

    /**
     * Step forward by one frame using VideoFrame.js, or fall back to
     * a fixed 1/30s increment.
     */
    function frameForward() {
        if (!videoElement) return;

        // Pause the video for frame-accurate stepping
        if (!videoElement.paused) {
            videoElement.pause();
            isPlaying = false;
            if (playPauseBtn) {
                playPauseBtn.textContent = 'Play';
            }
            stopRenderLoop();
        }

        if (videoFrame) {
            videoFrame.seekForward(1);
        } else {
            videoElement.currentTime = Math.min(
                videoElement.currentTime + FRAME_DURATION_FALLBACK,
                videoElement.duration || Infinity
            );
        }

        updateTimeDisplay();
    }

    /**
     * Step backward by one frame using VideoFrame.js, or fall back to
     * a fixed 1/30s decrement.
     */
    function frameBack() {
        if (!videoElement) return;

        // Pause the video for frame-accurate stepping
        if (!videoElement.paused) {
            videoElement.pause();
            isPlaying = false;
            if (playPauseBtn) {
                playPauseBtn.textContent = 'Play';
            }
            stopRenderLoop();
        }

        if (videoFrame) {
            videoFrame.seekBackward(1);
        } else {
            videoElement.currentTime = Math.max(
                videoElement.currentTime - FRAME_DURATION_FALLBACK,
                0
            );
        }

        updateTimeDisplay();
    }

    // ------------------------------------------------------------------
    // codeBehavior — the central coding function
    // ------------------------------------------------------------------

    /**
     * Record a behavioral annotation at the current video time.
     * For point events: creates a single-time annotation.
     * For state events: toggles between start and stop.
     *
     * @param {Object} behavior - The behavior definition from the ethogram.
     */
    function codeBehavior(behavior) {
        if (!videoElement || !videoElement.src) {
            showToast('Load a video first');
            return;
        }

        if (!behavior || !behavior.id) return;

        var onset = videoElement.currentTime;

        if (behavior.type === 'point') {
            _codePointEvent(behavior, onset);
        } else if (behavior.type === 'state') {
            if (!activeStates[behavior.id]) {
                _startStateEvent(behavior, onset);
            } else {
                _stopStateEvent(behavior, videoElement.currentTime);
            }
        }
    }

    /**
     * Record a point event annotation.
     */
    function _codePointEvent(behavior, onset) {
        var ann = {
            id: generateId('ann'),
            behaviorId: behavior.id,
            type: 'point',
            onset: onset,
            offset: null,
            createdAt: new Date().toISOString()
        };

        currentProject.annotations.push(ann);

        _pushUndo({
            type: 'add_point',
            annotationId: ann.id
        });

        // Flash the button
        var btn = getButtonForBehavior(behavior.id);
        if (btn) {
            btn.classList.add('flash');
            setTimeout(function () {
                btn.classList.remove('flash');
            }, POINT_FLASH_DURATION);
        }

        showToast(behavior.name + ' at ' + formatTime(onset));
        updateAnnotationCount();
        _triggerTimelineRedraw();
        OmniCoder.Store.autoSave(currentProject);
    }

    /**
     * Start recording a state event (onset).
     */
    function _startStateEvent(behavior, onset) {
        var ann = {
            id: generateId('ann'),
            behaviorId: behavior.id,
            type: 'state',
            onset: onset,
            offset: null,
            createdAt: new Date().toISOString()
        };

        currentProject.annotations.push(ann);
        activeStates[behavior.id] = ann;

        // Highlight the button to show recording is in progress
        var btn = getButtonForBehavior(behavior.id);
        if (btn) {
            btn.classList.add('active');
        }

        _pushUndo({
            type: 'start_state',
            annotationId: ann.id,
            behaviorId: behavior.id
        });

        showToast(behavior.name + ' started at ' + formatTime(onset));
        updateAnnotationCount();
        OmniCoder.Store.autoSave(currentProject);
    }

    /**
     * Stop recording a state event (set offset).
     */
    function _stopStateEvent(behavior, offset) {
        var ann = activeStates[behavior.id];
        if (!ann) return;

        ann.offset = offset;
        delete activeStates[behavior.id];

        // Remove highlight from button
        var btn = getButtonForBehavior(behavior.id);
        if (btn) {
            btn.classList.remove('active');
        }

        _pushUndo({
            type: 'stop_state',
            annotationId: ann.id,
            behaviorId: behavior.id
        });

        var duration = (ann.offset - ann.onset).toFixed(2);
        showToast(
            behavior.name + ': ' +
            formatTime(ann.onset) + ' \u2192 ' + formatTime(ann.offset) +
            ' (' + duration + 's)'
        );

        updateAnnotationCount();
        _triggerTimelineRedraw();
        OmniCoder.Store.autoSave(currentProject);
    }

    // ------------------------------------------------------------------
    // Undo system
    // ------------------------------------------------------------------

    /**
     * Push an undo action onto the project's undo stack, capping at
     * UNDO_STACK_MAX entries.
     * @param {Object} action - The undo action descriptor.
     */
    function _pushUndo(action) {
        if (!currentProject.undoStack) {
            currentProject.undoStack = [];
        }

        currentProject.undoStack.push(action);

        // Cap the stack
        while (currentProject.undoStack.length > UNDO_STACK_MAX) {
            currentProject.undoStack.shift();
        }
    }

    /**
     * Undo the most recent coding action.
     */
    function undo() {
        if (!currentProject || !currentProject.undoStack || currentProject.undoStack.length === 0) {
            showToast('Nothing to undo');
            return;
        }

        var action = currentProject.undoStack.pop();

        switch (action.type) {
            case 'add_point':
                _removeAnnotationById(action.annotationId);
                break;

            case 'start_state':
                _removeAnnotationById(action.annotationId);
                delete activeStates[action.behaviorId];
                var startBtn = getButtonForBehavior(action.behaviorId);
                if (startBtn) {
                    startBtn.classList.remove('active');
                }
                break;

            case 'stop_state':
                // Restore the annotation to open/recording state
                var ann = _findAnnotationById(action.annotationId);
                if (ann) {
                    ann.offset = null;
                    activeStates[action.behaviorId] = ann;
                    var stopBtn = getButtonForBehavior(action.behaviorId);
                    if (stopBtn) {
                        stopBtn.classList.add('active');
                    }
                }
                break;

            default:
                console.warn('OmniCoder Coder: unknown undo action type:', action.type);
                break;
        }

        showToast('Undone');
        updateAnnotationCount();
        _triggerTimelineRedraw();
        OmniCoder.Store.autoSave(currentProject);
    }

    // ------------------------------------------------------------------
    // Annotation helpers
    // ------------------------------------------------------------------

    /**
     * Remove an annotation from the project by its ID.
     * @param {string} id - The annotation ID.
     */
    function _removeAnnotationById(id) {
        if (!currentProject || !currentProject.annotations) return;

        var annotations = currentProject.annotations;
        for (var i = 0; i < annotations.length; i++) {
            if (annotations[i].id === id) {
                annotations.splice(i, 1);
                return;
            }
        }
    }

    /**
     * Find an annotation in the project by its ID.
     * @param {string} id - The annotation ID.
     * @returns {Object|null} The annotation object or null.
     */
    function _findAnnotationById(id) {
        if (!currentProject || !currentProject.annotations) return null;

        var annotations = currentProject.annotations;
        for (var i = 0; i < annotations.length; i++) {
            if (annotations[i].id === id) {
                return annotations[i];
            }
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Display updates
    // ------------------------------------------------------------------

    /**
     * Update the annotation count display.
     */
    function updateAnnotationCount() {
        if (annotationCountEl && currentProject && currentProject.annotations) {
            annotationCountEl.textContent = currentProject.annotations.length;
        }
    }

    /**
     * Update the time display element with current time and duration.
     */
    function updateTimeDisplay() {
        if (!timeDisplay || !videoElement) return;

        var current = videoElement.currentTime || 0;
        var duration = videoElement.duration || 0;

        // Duration can be NaN before video metadata loads
        if (isNaN(duration)) {
            duration = 0;
        }

        timeDisplay.textContent = formatTime(current) + ' / ' + formatTime(duration);
    }

    // ------------------------------------------------------------------
    // DOM helpers
    // ------------------------------------------------------------------

    /**
     * Get the behavior button DOM element for a given behavior ID.
     * @param {string} behaviorId - The behavior ID.
     * @returns {HTMLElement|null} The button element or null.
     */
    function getButtonForBehavior(behaviorId) {
        if (!behaviorButtonsContainer) return null;
        return behaviorButtonsContainer.querySelector(
            '[data-behavior-id="' + behaviorId + '"]'
        );
    }

    /**
     * Trigger a timeline redraw if the Timeline module is available.
     */
    function _triggerTimelineRedraw() {
        if (OmniCoder.Timeline && typeof OmniCoder.Timeline.render === 'function' && videoElement) {
            OmniCoder.Timeline.render(
                videoElement.currentTime || 0,
                currentProject.annotations,
                (currentProject.ethogram && currentProject.ethogram.behaviors) || [],
                videoElement.duration || currentProject.videoDuration || 0
            );
        }
    }

    // ------------------------------------------------------------------
    // destroy
    // ------------------------------------------------------------------

    /**
     * Clean up event listeners and state when navigating away from the
     * coder view. Must be called to prevent memory leaks and ghost
     * keyboard handlers.
     */
    function destroy() {
        // Remove keyboard listener
        if (_keydownHandler) {
            document.removeEventListener('keydown', _keydownHandler);
            _keydownHandler = null;
        }

        // Cancel animation frame
        stopRenderLoop();

        // Clear active states
        activeStates = {};

        // Reset playing state
        isPlaying = false;
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    OmniCoder.Coder = {
        // State
        get currentProject() { return currentProject; },
        set currentProject(val) { currentProject = val; },
        get activeStates() { return activeStates; },
        set activeStates(val) { activeStates = val; },
        get videoElement() { return videoElement; },
        set videoElement(val) { videoElement = val; },
        get videoFrame() { return videoFrame; },
        set videoFrame(val) { videoFrame = val; },
        get isPlaying() { return isPlaying; },
        set isPlaying(val) { isPlaying = val; },
        get animFrameId() { return animFrameId; },
        set animFrameId(val) { animFrameId = val; },

        // Functions
        init: init,
        loadVideo: loadVideo,
        setupEventListeners: setupEventListeners,
        togglePlayPause: togglePlayPause,
        startRenderLoop: startRenderLoop,
        stopRenderLoop: stopRenderLoop,
        seek: seek,
        frameForward: frameForward,
        frameBack: frameBack,
        codeBehavior: codeBehavior,
        undo: undo,
        updateAnnotationCount: updateAnnotationCount,
        updateTimeDisplay: updateTimeDisplay,
        getButtonForBehavior: getButtonForBehavior,
        destroy: destroy
    };
})();
