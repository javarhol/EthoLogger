/**
 * EthoLogger Mode Module
 * Handles Lab/Field mode switching for the coding interface.
 * Lab Mode = high-density desktop optimized, Field Mode = touch/outdoor optimized.
 *
 * Depends on:
 *   - EthoLogger.Store (store.js)
 */
(function () {
    'use strict';

    window.EthoLogger = window.EthoLogger || {};

    var MODES = { LAB: 'lab', FIELD: 'field' };
    var currentMode = MODES.LAB;

    function init() {
        var settings = EthoLogger.Store.getSettings();
        currentMode = settings.displayMode || MODES.LAB;
        applyMode(currentMode);
        _setupListeners();
    }

    function _setupListeners() {
        var labBtn = document.getElementById('btn-mode-lab');
        var fieldBtn = document.getElementById('btn-mode-field');

        if (labBtn) {
            labBtn.addEventListener('click', function () {
                setMode(MODES.LAB);
            });
        }
        if (fieldBtn) {
            fieldBtn.addEventListener('click', function () {
                setMode(MODES.FIELD);
            });
        }
    }

    function setMode(mode) {
        currentMode = mode;
        applyMode(mode);
        EthoLogger.Store.updateSettings({ displayMode: mode });
    }

    function applyMode(mode) {
        var body = document.body;
        body.classList.remove('mode-lab', 'mode-field');
        body.classList.add('mode-' + mode);

        var labBtn = document.getElementById('btn-mode-lab');
        var fieldBtn = document.getElementById('btn-mode-field');
        if (labBtn) labBtn.classList.toggle('active', mode === MODES.LAB);
        if (fieldBtn) fieldBtn.classList.toggle('active', mode === MODES.FIELD);
    }

    function getMode() {
        return currentMode;
    }

    EthoLogger.Mode = {
        init: init,
        setMode: setMode,
        getMode: getMode,
        MODES: MODES
    };
})();
