/**
 * EthoLogger Store Module
 * Handles persistence via localStorage and file import/export.
 * Depends on EthoLogger.Utils (utils.js must be loaded first).
 */
(function () {
    'use strict';

    window.EthoLogger = window.EthoLogger || {};

    var INDEX_KEY = 'lome_projects_index';
    var SETTINGS_KEY = 'lome_settings';

    // ---------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------

    function projectKey(id) {
        return 'lome_project_' + id;
    }

    function readIndex() {
        try {
            var raw = localStorage.getItem(INDEX_KEY);
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (e) {
            console.error('EthoLogger Store: failed to read project index', e);
        }
        return [];
    }

    function writeIndex(ids) {
        localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
    }

    // ---------------------------------------------------------------
    // Project CRUD
    // ---------------------------------------------------------------

    /**
     * List all projects. Returns an array of header objects sorted by
     * modifiedAt descending (most recent first). Each header contains:
     * id, name, coderId, videoFileName, modifiedAt, annotationCount.
     */
    function listProjects() {
        var ids = readIndex();
        var projects = [];

        for (var i = 0; i < ids.length; i++) {
            var proj = loadProject(ids[i]);
            if (proj) {
                projects.push({
                    id: proj.id,
                    name: proj.name || '',
                    coderId: proj.coderId || '',
                    videoFileName: proj.videoFileName || '',
                    modifiedAt: proj.modifiedAt || '',
                    annotationCount: (proj.annotations && proj.annotations.length) || 0
                });
            }
        }

        projects.sort(function (a, b) {
            if (a.modifiedAt > b.modifiedAt) return -1;
            if (a.modifiedAt < b.modifiedAt) return 1;
            return 0;
        });

        return projects;
    }

    /**
     * Load a single project by its ID.
     * Returns the parsed project object or null if not found.
     */
    function loadProject(id) {
        try {
            var raw = localStorage.getItem(projectKey(id));
            if (raw) {
                var project = JSON.parse(raw);
                // Migration: ensure mutualExclusivityGroups exists
                if (project && project.ethogram && !project.ethogram.mutualExclusivityGroups) {
                    project.ethogram.mutualExclusivityGroups = [];
                }
                return project;
            }
        } catch (e) {
            console.error('EthoLogger Store: failed to load project ' + id, e);
        }
        return null;
    }

    /**
     * Save a project. Updates modifiedAt, writes to localStorage,
     * and ensures the project is in the index.
     * Catches QuotaExceededError and alerts the user.
     */
    function saveProject(project) {
        project.modifiedAt = new Date().toISOString();

        try {
            localStorage.setItem(projectKey(project.id), JSON.stringify(project));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                alert(
                    'Storage quota exceeded. Please export your projects and delete old ones to free up space.'
                );
            }
            console.error('EthoLogger Store: failed to save project', e);
            return;
        }

        // Ensure project is in the index
        var ids = readIndex();
        if (ids.indexOf(project.id) === -1) {
            ids.push(project.id);
            writeIndex(ids);
        }
    }

    /**
     * Delete a project by ID. Removes from the index and removes
     * the localStorage entry.
     */
    function deleteProject(id) {
        var ids = readIndex();
        var idx = ids.indexOf(id);
        if (idx !== -1) {
            ids.splice(idx, 1);
            writeIndex(ids);
        }
        localStorage.removeItem(projectKey(id));
    }

    /**
     * Debounced version of saveProject (500ms).
     */
    var autoSave = EthoLogger.Utils.debounce(saveProject, 500);

    // ---------------------------------------------------------------
    // Settings
    // ---------------------------------------------------------------

    /**
     * Read the settings object from localStorage.
     * Returns an object (never null).
     */
    function getSettings() {
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (e) {
            console.error('EthoLogger Store: failed to read settings', e);
        }
        return {};
    }

    /**
     * Merge a partial settings object into the stored settings.
     */
    function updateSettings(partial) {
        var settings = getSettings();
        for (var key in partial) {
            if (partial.hasOwnProperty(key)) {
                settings[key] = partial[key];
            }
        }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    // ---------------------------------------------------------------
    // Import / Export
    // ---------------------------------------------------------------

    /**
     * Export a project as a formatted JSON file download.
     */
    function exportProjectJSON(project) {
        var json = JSON.stringify(project, null, 2);
        var filename = (project.name || 'project') + '_project.json';
        EthoLogger.Utils.downloadFile(json, filename, 'application/json');
    }

    /**
     * Import a project from a JSON File object.
     * Returns a Promise that resolves with the parsed project object.
     */
    function importProjectJSON(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();

            reader.onload = function (e) {
                try {
                    var project = JSON.parse(e.target.result);

                    if (!project.id || !project.name || !project.ethogram || !project.annotations) {
                        reject(new Error('Invalid project file: missing required fields (id, name, ethogram, annotations).'));
                        return;
                    }

                    resolve(project);
                } catch (parseError) {
                    reject(new Error('Failed to parse project JSON: ' + parseError.message));
                }
            };

            reader.onerror = function () {
                reject(new Error('Failed to read file.'));
            };

            reader.readAsText(file);
        });
    }

    /**
     * Export an ethogram as a formatted JSON file download.
     */
    function exportEthogramJSON(ethogram) {
        var json = JSON.stringify(ethogram, null, 2);
        var filename = (ethogram.name || 'ethogram') + '_ethogram.json';
        EthoLogger.Utils.downloadFile(json, filename, 'application/json');
    }

    /**
     * Import an ethogram from a JSON File object.
     * Returns a Promise that resolves with the parsed ethogram object.
     */
    function importEthogramJSON(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();

            reader.onload = function (e) {
                try {
                    var ethogram = JSON.parse(e.target.result);

                    if (!ethogram.behaviors || !Array.isArray(ethogram.behaviors)) {
                        reject(new Error('Invalid ethogram file: missing behaviors array.'));
                        return;
                    }

                    resolve(ethogram);
                } catch (parseError) {
                    reject(new Error('Failed to parse ethogram JSON: ' + parseError.message));
                }
            };

            reader.onerror = function () {
                reject(new Error('Failed to read file.'));
            };

            reader.readAsText(file);
        });
    }

    // Expose on the shared namespace
    EthoLogger.Store = {
        listProjects: listProjects,
        loadProject: loadProject,
        saveProject: saveProject,
        deleteProject: deleteProject,
        autoSave: autoSave,
        getSettings: getSettings,
        updateSettings: updateSettings,
        exportProjectJSON: exportProjectJSON,
        importProjectJSON: importProjectJSON,
        exportEthogramJSON: exportEthogramJSON,
        importEthogramJSON: importEthogramJSON
    };
})();
