/**
 * EthoLogger Timeline Module
 * Canvas-based timeline renderer for behavioral annotation visualization.
 * Depends on EthoLogger.Utils (utils.js must be loaded first).
 */
(function () {
    'use strict';

    window.EthoLogger = window.EthoLogger || {};

    // ---------------------------------------------------------------
    // Module state
    // ---------------------------------------------------------------

    var canvas = null;
    var ctx = null;
    var project = null;
    var pixelsPerSecond = 10;
    var scrollOffset = 0;
    var dpr = 1;
    var laneHeight = 30;
    var leftMargin = 100;
    var lanes = [];

    // Pre-computed lane Y positions (top of each lane)
    var _laneYPositions = [];

    // Minimum pixelsPerSecond (computed to fit entire video)
    var _minPixelsPerSecond = 1;

    // Maximum pixelsPerSecond
    var _maxPixelsPerSecond = 100;

    // Event listener references for cleanup
    var _boundHandleClick = null;
    var _boundHandleWheel = null;
    var _boundHandleResize = null;
    var _resizeDebounceTimer = null;

    // Diagonal stripe pattern canvas for active annotations
    var _stripePatternCanvas = null;

    // ---------------------------------------------------------------
    // Initialization
    // ---------------------------------------------------------------

    /**
     * Initialize the timeline renderer.
     * @param {string} canvasId - ID of the canvas element.
     * @param {Object} proj - Reference to the current project.
     */
    function init(canvasId, proj) {
        canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error('EthoLogger Timeline: canvas element "' + canvasId + '" not found.');
            return;
        }

        ctx = canvas.getContext('2d');
        project = proj;

        computeLanes(project);
        resizeCanvas();
        _precomputeLanePositions();

        // Set up event listeners
        _boundHandleClick = function (e) { handleClick(e); };
        _boundHandleWheel = function (e) { handleWheel(e); };
        _boundHandleResize = function () {
            if (_resizeDebounceTimer !== null) {
                clearTimeout(_resizeDebounceTimer);
            }
            _resizeDebounceTimer = setTimeout(function () {
                _resizeDebounceTimer = null;
                resizeCanvas();
                computeLanes(project);
                _precomputeLanePositions();
                _renderCurrent();
            }, 150);
        };

        canvas.addEventListener('click', _boundHandleClick);
        canvas.addEventListener('wheel', _boundHandleWheel, { passive: false });
        window.addEventListener('resize', _boundHandleResize);

        // Initial render with time 0
        _renderCurrent();
    }

    // ---------------------------------------------------------------
    // Canvas sizing
    // ---------------------------------------------------------------

    /**
     * DPR-aware canvas sizing. Resizes the canvas to fill its parent
     * and recalculates zoom to fit the video duration.
     */
    function resizeCanvas() {
        if (!canvas) return;

        var rect = canvas.parentElement.getBoundingClientRect();
        dpr = window.devicePixelRatio || 1;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Recalculate pixelsPerSecond to fit video duration
        var duration = _getVideoDuration();
        var availableWidth = rect.width - leftMargin;

        if (duration > 0 && availableWidth > 0) {
            _minPixelsPerSecond = availableWidth / duration;
            // Only reset zoom if it's less than the minimum (e.g., first load)
            if (pixelsPerSecond < _minPixelsPerSecond) {
                pixelsPerSecond = _minPixelsPerSecond;
            }
        } else {
            // Sensible default when duration is unknown
            _minPixelsPerSecond = 1;
            if (pixelsPerSecond < _minPixelsPerSecond) {
                pixelsPerSecond = 10;
            }
        }
    }

    // ---------------------------------------------------------------
    // Lane computation
    // ---------------------------------------------------------------

    /**
     * Build lane layout from the project's ethogram and annotations.
     * Sorts behaviors by category (alphabetical), then by name.
     * @param {Object} proj - The current project.
     */
    function computeLanes(proj) {
        lanes = [];

        if (!proj || !proj.ethogram || !proj.ethogram.behaviors) {
            return;
        }

        // Build a combined set of behaviors from the ethogram
        var behaviors = proj.ethogram.behaviors.slice();

        // Sort by category alphabetically, then by name
        behaviors.sort(function (a, b) {
            var catA = (a.category || '').toLowerCase();
            var catB = (b.category || '').toLowerCase();
            if (catA < catB) return -1;
            if (catA > catB) return 1;

            var nameA = (a.name || '').toLowerCase();
            var nameB = (b.name || '').toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;

            return 0;
        });

        var subjects = (proj && proj.subjects) || [];

        if (subjects.length > 0) {
            // Subject-grouped lanes: one lane per subject x behavior
            for (var s = 0; s < subjects.length; s++) {
                for (var i = 0; i < behaviors.length; i++) {
                    var beh = behaviors[i];
                    lanes.push({
                        behaviorId: beh.id,
                        subjectId: subjects[s].id,
                        subjectName: subjects[s].name,
                        name: beh.name || '',
                        category: beh.category || '',
                        color: beh.color || '#607D8B',
                        isFirstInSubject: (i === 0)
                    });
                }
            }
            // Widen left margin to fit subject labels
            leftMargin = 140;
        } else {
            // No subjects: one lane per behavior
            for (var j = 0; j < behaviors.length; j++) {
                var beh2 = behaviors[j];
                lanes.push({
                    behaviorId: beh2.id,
                    subjectId: null,
                    name: beh2.name || '',
                    category: beh2.category || '',
                    color: beh2.color || '#607D8B'
                });
            }
            leftMargin = 100;
        }

        // Calculate lane height
        var canvasHeight = canvas ? (canvas.height / dpr) : 300;
        var numLanes = lanes.length || 1;
        laneHeight = canvasHeight / numLanes;

        // Clamp between 18px and 40px
        laneHeight = EthoLogger.Utils.clamp(laneHeight, 18, 40);
    }

    /**
     * Pre-compute the Y position of the top of each lane.
     */
    function _precomputeLanePositions() {
        _laneYPositions = [];
        for (var i = 0; i < lanes.length; i++) {
            _laneYPositions[i] = i * laneHeight;
        }
    }

    // ---------------------------------------------------------------
    // Coordinate conversion
    // ---------------------------------------------------------------

    /**
     * Convert a time in seconds to a canvas X coordinate.
     * @param {number} time - Time in seconds.
     * @returns {number} X pixel position on canvas.
     */
    function timeToX(time) {
        return leftMargin + (time - scrollOffset) * pixelsPerSecond;
    }

    /**
     * Convert a canvas X coordinate to a time in seconds.
     * @param {number} x - X pixel position on canvas.
     * @returns {number} Time in seconds.
     */
    function xToTime(x) {
        return scrollOffset + (x - leftMargin) / pixelsPerSecond;
    }

    // ---------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------

    /**
     * Render with whatever the current video time is (used for
     * resize / zoom events when we don't have a fresh time).
     */
    function _renderCurrent() {
        var videoEl = document.querySelector('video');
        var currentTime = videoEl ? videoEl.currentTime : 0;
        var duration = _getVideoDuration();
        var annotations = (project && project.annotations) || [];
        var behaviors = (project && project.ethogram && project.ethogram.behaviors) || [];
        render(currentTime, annotations, behaviors, duration);
    }

    /**
     * Full redraw of the timeline. Called per frame during playback
     * or on annotation change.
     * @param {number} currentTime - Current video playback time in seconds.
     * @param {Array} annotations - Array of annotation objects.
     * @param {Array} behaviors - Array of behavior definitions.
     * @param {number} duration - Total video duration in seconds.
     * @param {Array} [scanWindows] - Optional scan-sampled windows to overlay.
     */
    function render(currentTime, annotations, behaviors, duration, scanWindows) {
        if (!canvas || !ctx) return;

        var width = canvas.width / dpr;
        var height = canvas.height / dpr;

        // 1. Clear canvas
        ctx.clearRect(0, 0, width, height);

        // 2. Draw background
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(0, 0, width, height);

        // 3. Draw lane backgrounds with alternating stripes
        _drawLaneBackgrounds(ctx, width, height);

        // 4. Draw lane labels
        _drawLaneLabels(ctx, height);

        // 5. Draw time grid
        drawTimeGrid(ctx, width, height, duration);

        // 6. Draw annotation bars
        _drawAnnotations(ctx, annotations, currentTime, width);

        // 6b. Draw scan-sampled windows as a translucent band along the top
        if (scanWindows && scanWindows.length) {
            _drawScanWindows(ctx, scanWindows, width);
        }

        // 7. Draw playhead
        _drawPlayhead(ctx, currentTime, height, duration);
    }

    /**
     * Draw scan-sampled windows as a translucent band along the top of
     * the timeline. Windows that the user has played during scan mode
     * get a distinct color so they can audit which intervals were
     * actually reviewed.
     * @private
     */
    function _drawScanWindows(ctx, scanWindows, width) {
        var bandY = 0;
        var bandHeight = 6;

        for (var i = 0; i < scanWindows.length; i++) {
            var win = scanWindows[i];
            if (!win || typeof win.startSec !== 'number' || typeof win.endSec !== 'number') {
                continue;
            }
            var x0 = timeToX(win.startSec);
            var x1 = timeToX(win.endSec);

            // Skip windows fully outside the visible range
            if (x1 < leftMargin || x0 > width) continue;

            // Clip to the timeline area
            if (x0 < leftMargin) x0 = leftMargin;
            if (x1 > width) x1 = width;

            var w = Math.max(2, x1 - x0);
            ctx.fillStyle = 'rgba(120, 200, 255, 0.45)';
            ctx.fillRect(x0, bandY, w, bandHeight);
        }

        // Faint baseline under the band
        ctx.fillStyle = 'rgba(120, 200, 255, 0.12)';
        ctx.fillRect(leftMargin, bandY + bandHeight, width - leftMargin, 1);
    }

    /**
     * Draw alternating lane backgrounds and separator lines.
     */
    function _drawLaneBackgrounds(ctx, width, height) {
        for (var i = 0; i < lanes.length; i++) {
            var y = _laneYPositions[i];

            // Alternating stripe
            ctx.fillStyle = (i % 2 === 0) ? '#1A1A1A' : '#222222';
            ctx.fillRect(leftMargin, y, width - leftMargin, laneHeight);

            // Also fill the label area with slightly darker background
            ctx.fillStyle = (i % 2 === 0) ? '#181818' : '#202020';
            ctx.fillRect(0, y, leftMargin, laneHeight);

            // Lane separator line
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y + laneHeight);
            ctx.lineTo(width, y + laneHeight);
            ctx.stroke();
        }
    }

    /**
     * Draw lane labels in the left margin area.
     * Shows category header (uppercase, muted) above the first behavior
     * in each category group.
     */
    function _drawLaneLabels(ctx, height) {
        var lastCategory = null;
        var lastSubjectId = null;
        var hasSubjects = lanes.length > 0 && lanes[0].subjectId;

        for (var i = 0; i < lanes.length; i++) {
            var lane = lanes[i];
            var y = _laneYPositions[i];

            if (hasSubjects) {
                // Draw subject group header
                if (lane.subjectId !== lastSubjectId) {
                    // Subject separator line
                    if (lastSubjectId !== null) {
                        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(0, y);
                        ctx.lineTo(leftMargin, y);
                        ctx.stroke();
                    }
                }

                // Subject name + behavior name
                var textX = 6;
                if (lane.isFirstInSubject) {
                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.font = 'bold 9px sans-serif';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'left';
                    ctx.fillText(lane.subjectName.toUpperCase(), textX, y + laneHeight * 0.25);

                    ctx.fillStyle = '#ffffff';
                    ctx.font = '10px sans-serif';
                    ctx.fillText(lane.name, textX, y + laneHeight * 0.72);
                } else {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '10px sans-serif';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'left';
                    ctx.fillText(lane.name, textX, y + laneHeight * 0.5);
                }

                lastSubjectId = lane.subjectId;
            } else {
                // No subjects: original category-based layout
                if (lane.category && lane.category !== lastCategory) {
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.font = '9px sans-serif';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'left';
                    var catY = y + laneHeight * 0.28;
                    ctx.fillText(lane.category.toUpperCase(), 6, catY);

                    ctx.fillStyle = '#ffffff';
                    ctx.font = '11px sans-serif';
                    var nameY = y + laneHeight * 0.7;
                    ctx.fillText(lane.name, 6, nameY);
                } else {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '11px sans-serif';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'left';
                    ctx.fillText(lane.name, 6, y + laneHeight * 0.5);
                }

                lastCategory = lane.category;
            }
        }

        // Draw a vertical separator line between labels and timeline area
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(leftMargin, 0);
        ctx.lineTo(leftMargin, height);
        ctx.stroke();
    }

    /**
     * Draw the time grid with major and minor tick marks.
     * @param {CanvasRenderingContext2D} ctx - Canvas context.
     * @param {number} width - Canvas width in CSS pixels.
     * @param {number} height - Canvas height in CSS pixels.
     * @param {number} duration - Video duration in seconds.
     */
    function drawTimeGrid(ctx, width, height, duration) {
        var minorInterval, majorInterval;

        if (pixelsPerSecond > 50) {
            minorInterval = 1;
            majorInterval = 5;
        } else if (pixelsPerSecond > 10) {
            minorInterval = 5;
            majorInterval = 30;
        } else if (pixelsPerSecond > 2) {
            minorInterval = 10;
            majorInterval = 60;
        } else {
            minorInterval = 30;
            majorInterval = 120;
        }

        // Calculate visible time range
        var visibleStartTime = xToTime(leftMargin);
        var visibleEndTime = xToTime(width);

        // Extend slightly beyond visible range for partial ticks
        var startTick = Math.floor(visibleStartTime / minorInterval) * minorInterval;
        var endTick = Math.ceil(visibleEndTime / minorInterval) * minorInterval;

        // Clamp to valid range
        if (startTick < 0) startTick = 0;
        if (duration > 0 && endTick > duration) endTick = duration + minorInterval;

        for (var t = startTick; t <= endTick; t += minorInterval) {
            var x = timeToX(t);

            // Skip ticks outside the timeline area
            if (x < leftMargin || x > width) continue;

            var isMajor = (t % majorInterval === 0);

            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.lineWidth = 1;

            if (isMajor) {
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.stroke();

                // Time label
                ctx.fillStyle = '#aaaaaa';
                ctx.font = '10px monospace';
                ctx.textBaseline = 'bottom';
                ctx.textAlign = 'center';
                ctx.fillText(_formatGridTime(t), x, height - 2);
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.stroke();
            }
        }
    }

    /**
     * Draw all annotation bars that overlap the visible time range.
     */
    function _drawAnnotations(ctx, annotations, currentTime, width) {
        if (!annotations || annotations.length === 0) return;

        // Build a lookup from composite key (behaviorId__subjectId) to lane index
        var laneLookup = {};
        var hasSubjects = lanes.length > 0 && lanes[0].subjectId;
        for (var i = 0; i < lanes.length; i++) {
            var key = lanes[i].behaviorId + '__' + (lanes[i].subjectId || '');
            laneLookup[key] = i;
        }

        // Calculate visible time range for culling
        var visibleStart = xToTime(leftMargin);
        var visibleEnd = xToTime(width);

        for (var a = 0; a < annotations.length; a++) {
            var annotation = annotations[a];
            var lookupKey = annotation.behaviorId + '__' + (annotation.subjectId || '');
            var laneIndex = laneLookup[lookupKey];

            if (laneIndex === undefined) continue;

            var lane = lanes[laneIndex];
            drawAnnotationBar(ctx, annotation, lane, laneIndex, currentTime, visibleStart, visibleEnd);
        }
    }

    /**
     * Draw a single annotation bar on the timeline.
     * @param {CanvasRenderingContext2D} ctx - Canvas context.
     * @param {Object} annotation - The annotation object.
     * @param {Object} lane - The lane definition.
     * @param {number} laneIndex - Index of the lane.
     * @param {number} currentTime - Current video time.
     * @param {number} visibleStart - Start of visible time range.
     * @param {number} visibleEnd - End of visible time range.
     */
    function drawAnnotationBar(ctx, annotation, lane, laneIndex, currentTime, visibleStart, visibleEnd) {
        var onset = annotation.onset;
        var offset = annotation.offset;
        var isPoint = (annotation.type === 'point');
        var isActive = (!isPoint && offset === null);

        // Determine the effective end time
        var effectiveEnd;
        if (isPoint) {
            effectiveEnd = onset;
        } else if (isActive) {
            effectiveEnd = currentTime;
        } else {
            effectiveEnd = offset;
        }

        // Cull: skip if entirely outside visible range
        if (effectiveEnd < visibleStart && onset < visibleStart) return;
        if (onset > visibleEnd) return;

        var y = _laneYPositions[laneIndex];
        var barPadding = 2;
        var barY = y + barPadding;
        var barHeight = laneHeight - barPadding * 2;
        var color = lane.color;

        if (isPoint) {
            // Point event: thin vertical line + inverted triangle marker
            var px = timeToX(onset);

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px, barY);
            ctx.lineTo(px, barY + barHeight);
            ctx.stroke();

            // Inverted triangle at top
            var triWidth = 6;
            var triHeight = 5;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(px - triWidth / 2, barY);
            ctx.lineTo(px + triWidth / 2, barY);
            ctx.lineTo(px, barY + triHeight);
            ctx.closePath();
            ctx.fill();
        } else {
            // State event: filled rectangle
            var x1 = timeToX(onset);
            var x2 = timeToX(effectiveEnd);
            var barWidth = x2 - x1;

            if (barWidth < 1) barWidth = 1;

            if (isActive) {
                // Active (open) state event: hatched/striped pattern
                ctx.save();

                // Draw base color at reduced alpha
                ctx.fillStyle = _colorWithAlpha(color, 0.4);
                _fillRoundedRect(ctx, x1, barY, barWidth, barHeight, barWidth > 4 ? 2 : 0);

                // Draw diagonal stripe pattern
                ctx.beginPath();
                _clipRoundedRect(ctx, x1, barY, barWidth, barHeight, barWidth > 4 ? 2 : 0);
                ctx.clip();

                ctx.strokeStyle = _colorWithAlpha(color, 0.7);
                ctx.lineWidth = 1.5;

                var stripeSpacing = 6;
                var totalSpan = barWidth + barHeight;
                for (var s = -barHeight; s < totalSpan; s += stripeSpacing) {
                    ctx.beginPath();
                    ctx.moveTo(x1 + s, barY + barHeight);
                    ctx.lineTo(x1 + s + barHeight, barY);
                    ctx.stroke();
                }

                ctx.restore();

                // Draw border for active annotation
                ctx.strokeStyle = _colorWithAlpha(color, 0.8);
                ctx.lineWidth = 1;
                _strokeRoundedRect(ctx, x1, barY, barWidth, barHeight, barWidth > 4 ? 2 : 0);
            } else {
                // Completed state event: solid fill
                ctx.fillStyle = _colorWithAlpha(color, 0.7);
                _fillRoundedRect(ctx, x1, barY, barWidth, barHeight, barWidth > 4 ? 2 : 0);
            }
        }
    }

    /**
     * Draw the playhead (red vertical line at current time).
     */
    function _drawPlayhead(ctx, currentTime, height, duration) {
        if (currentTime < 0) return;
        if (duration > 0 && currentTime > duration) return;

        var x = timeToX(currentTime);
        var width = canvas.width / dpr;

        // Only draw if within visible area
        if (x < leftMargin || x > width) return;

        // Playhead line
        ctx.strokeStyle = '#FF4C00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        // Current time label
        var timeLabel = EthoLogger.Utils.formatTime(currentTime);
        ctx.fillStyle = '#FF4C00';
        ctx.font = 'bold 10px monospace';
        ctx.textBaseline = 'top';

        // Position label to the right of playhead, or left if near the edge
        var labelWidth = ctx.measureText(timeLabel).width + 6;
        var labelX;
        if (x + labelWidth + 4 > width) {
            labelX = x - labelWidth - 2;
            ctx.textAlign = 'right';
            ctx.fillText(timeLabel, x - 4, 2);
        } else {
            ctx.textAlign = 'left';
            ctx.fillText(timeLabel, x + 4, 2);
        }
    }

    // ---------------------------------------------------------------
    // Event handlers
    // ---------------------------------------------------------------

    /**
     * Handle click on the canvas: seek video to clicked time.
     * @param {MouseEvent} event
     */
    function handleClick(event) {
        if (!canvas) return;

        var rect = canvas.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var time = xToTime(x);

        // Ignore clicks in the label area
        if (x < leftMargin) return;

        var duration = _getVideoDuration();

        // Clamp to valid range
        if (time < 0) time = 0;
        if (duration > 0 && time > duration) time = duration;

        // Seek the video
        var videoEl = document.querySelector('video');
        if (videoEl) {
            videoEl.currentTime = time;
        }

        // Trigger a render update
        var annotations = (project && project.annotations) || [];
        var behaviors = (project && project.ethogram && project.ethogram.behaviors) || [];
        render(time, annotations, behaviors, duration);
    }

    /**
     * Handle mouse wheel: zoom in/out centered on cursor position.
     * @param {WheelEvent} event
     */
    function handleWheel(event) {
        event.preventDefault();

        if (!canvas) return;

        var rect = canvas.getBoundingClientRect();
        var mouseX = event.clientX - rect.left;

        // Time under the mouse cursor (zoom anchor)
        var anchorTime = xToTime(mouseX);

        // Zoom: scroll up = zoom in, scroll down = zoom out
        if (event.deltaY < 0) {
            pixelsPerSecond *= 1.2;
        } else {
            pixelsPerSecond /= 1.2;
        }

        // Clamp
        pixelsPerSecond = EthoLogger.Utils.clamp(pixelsPerSecond, _minPixelsPerSecond, _maxPixelsPerSecond);

        // Adjust scrollOffset to keep the anchor time under the mouse
        scrollOffset = anchorTime - (mouseX - leftMargin) / pixelsPerSecond;

        // Don't scroll before time 0
        if (scrollOffset < 0) scrollOffset = 0;

        // Re-render
        _renderCurrent();
    }

    /**
     * Set pixelsPerSecond directly and re-render.
     * @param {number} level - New pixelsPerSecond value.
     */
    function setZoom(level) {
        pixelsPerSecond = EthoLogger.Utils.clamp(level, _minPixelsPerSecond, _maxPixelsPerSecond);
        _renderCurrent();
    }

    /**
     * Remove event listeners and cancel pending operations.
     */
    function destroy() {
        if (canvas && _boundHandleClick) {
            canvas.removeEventListener('click', _boundHandleClick);
        }
        if (canvas && _boundHandleWheel) {
            canvas.removeEventListener('wheel', _boundHandleWheel);
        }
        if (_boundHandleResize) {
            window.removeEventListener('resize', _boundHandleResize);
        }
        if (_resizeDebounceTimer !== null) {
            clearTimeout(_resizeDebounceTimer);
            _resizeDebounceTimer = null;
        }

        _boundHandleClick = null;
        _boundHandleWheel = null;
        _boundHandleResize = null;
        canvas = null;
        ctx = null;
        project = null;
        lanes = [];
        _laneYPositions = [];
    }

    // ---------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------

    /**
     * Get the video duration from the DOM video element or project metadata.
     * @returns {number} Duration in seconds, or 0 if unknown.
     */
    function _getVideoDuration() {
        var videoEl = document.querySelector('video');
        if (videoEl && videoEl.duration && isFinite(videoEl.duration)) {
            return videoEl.duration;
        }
        if (project && project.videoDuration) {
            return project.videoDuration;
        }
        return 0;
    }

    /**
     * Format a time value for display in the time grid.
     * Shows MM:SS for times under an hour, H:MM:SS for longer.
     * @param {number} seconds
     * @returns {string}
     */
    function _formatGridTime(seconds) {
        var totalSecs = Math.floor(seconds);
        var mins = Math.floor(totalSecs / 60);
        var secs = totalSecs % 60;

        if (mins >= 60) {
            var hours = Math.floor(mins / 60);
            mins = mins % 60;
            return hours + ':' + (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
        }

        return (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
    }

    /**
     * Convert a hex color string to rgba with a given alpha.
     * @param {string} hex - Hex color (e.g. "#4CAF50").
     * @param {number} alpha - Alpha value 0-1.
     * @returns {string} rgba() CSS color string.
     */
    function _colorWithAlpha(hex, alpha) {
        // Handle shorthand hex
        var r, g, b;
        var cleanHex = hex.replace('#', '');

        if (cleanHex.length === 3) {
            r = parseInt(cleanHex[0] + cleanHex[0], 16);
            g = parseInt(cleanHex[1] + cleanHex[1], 16);
            b = parseInt(cleanHex[2] + cleanHex[2], 16);
        } else {
            r = parseInt(cleanHex.substring(0, 2), 16);
            g = parseInt(cleanHex.substring(2, 4), 16);
            b = parseInt(cleanHex.substring(4, 6), 16);
        }

        if (isNaN(r)) r = 128;
        if (isNaN(g)) g = 128;
        if (isNaN(b)) b = 128;

        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    /**
     * Fill a rounded rectangle path.
     */
    function _fillRoundedRect(ctx, x, y, width, height, radius) {
        if (radius <= 0 || width < radius * 2) {
            ctx.fillRect(x, y, width, height);
            return;
        }
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * Stroke a rounded rectangle path.
     */
    function _strokeRoundedRect(ctx, x, y, width, height, radius) {
        if (radius <= 0 || width < radius * 2) {
            ctx.strokeRect(x, y, width, height);
            return;
        }
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.stroke();
    }

    /**
     * Create a clipping path for a rounded rectangle (does not fill or stroke).
     */
    function _clipRoundedRect(ctx, x, y, width, height, radius) {
        if (radius <= 0 || width < radius * 2) {
            ctx.rect(x, y, width, height);
            return;
        }
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------

    EthoLogger.Timeline = {
        // State (read access)
        get canvas() { return canvas; },
        get ctx() { return ctx; },
        get project() { return project; },
        get pixelsPerSecond() { return pixelsPerSecond; },
        get scrollOffset() { return scrollOffset; },
        get dpr() { return dpr; },
        get laneHeight() { return laneHeight; },
        get leftMargin() { return leftMargin; },
        get lanes() { return lanes; },

        // Functions
        init: init,
        resizeCanvas: resizeCanvas,
        computeLanes: computeLanes,
        render: render,
        timeToX: timeToX,
        xToTime: xToTime,
        drawTimeGrid: drawTimeGrid,
        drawAnnotationBar: drawAnnotationBar,
        handleClick: handleClick,
        handleWheel: handleWheel,
        setZoom: setZoom,
        destroy: destroy
    };
})();
