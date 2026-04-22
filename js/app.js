/**
 * EthoLogger App Module
 * Application orchestrator — boot sequence, view navigation, project management.
 * This is the last script loaded. Depends on all other EthoLogger modules.
 */
(function () {
    'use strict';

    window.EthoLogger = window.EthoLogger || {};

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------

    var currentProject = null;

    // ---------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------

    /**
     * Called on DOMContentLoaded. Sets up global UI and shows the landing page.
     */
    function init() {
        // Check for a last-used project (informational; landing is always shown first)
        var settings = EthoLogger.Store.getSettings();
        if (settings.lastProjectId) {
            // Could auto-resume, but we show landing for explicitness
        }

        // Initialize mode switcher (Lab/Field)
        if (EthoLogger.Mode) {
            EthoLogger.Mode.init();
        }

        showLanding();
        _setupHeaderUI();
        _setupHelpShortcut();
    }

    // ---------------------------------------------------------------
    // Header UI
    // ---------------------------------------------------------------

    function _setupHeaderUI() {
        // Save button
        var saveBtn = document.getElementById('btn-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', function () {
                if (currentProject) {
                    EthoLogger.Store.saveProject(currentProject);
                    EthoLogger.Utils.showToast('Project saved');
                }
            });
        }

        // Help button
        var helpBtn = document.getElementById('btn-help');
        if (helpBtn) {
            helpBtn.addEventListener('click', function () {
                showHelp();
            });
        }

        // Export project JSON button
        var exportBtn = document.getElementById('btn-export-project');
        if (exportBtn) {
            exportBtn.addEventListener('click', function () {
                if (currentProject) {
                    EthoLogger.Store.exportProjectJSON(currentProject);
                }
            });
        }
    }

    /**
     * Update the header to reflect the current project state.
     */
    function _updateHeader() {
        var projectInfo = document.getElementById('header-project-info');
        if (projectInfo) {
            if (currentProject) {
                projectInfo.textContent = currentProject.name;
                projectInfo.style.display = '';
            } else {
                projectInfo.textContent = '';
                projectInfo.style.display = 'none';
            }
        }
    }

    // ---------------------------------------------------------------
    // View: Landing
    // ---------------------------------------------------------------

    function showLanding() {
        _cleanupCurrentView();
        currentProject = null;
        _updateHeader();
        EthoLogger.Utils.showView('view-landing');
        _renderLandingProjects();
    }

    /**
     * Render the recent projects list on the landing page.
     */
    function _renderLandingProjects() {
        var container = document.getElementById('recent-projects');
        if (!container) return;

        var projects = EthoLogger.Store.listProjects();
        container.innerHTML = '';

        if (projects.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'landing-empty';
            empty.textContent = 'No recent projects. Create a new project to get started.';
            container.appendChild(empty);
        } else {
            var grid = document.createElement('div');
            grid.className = 'recent-projects-grid';

            for (var i = 0; i < projects.length; i++) {
                var proj = projects[i];
                var card = _createProjectCard(proj);
                grid.appendChild(card);
            }

            container.appendChild(grid);
        }

        // Wire up "New Project" button
        var newBtn = document.getElementById('btn-new-project');
        if (newBtn) {
            // Remove old listeners by cloning
            var newNewBtn = newBtn.cloneNode(true);
            newBtn.parentNode.replaceChild(newNewBtn, newBtn);
            newNewBtn.addEventListener('click', function () {
                showSetup();
            });
        }

        // Wire up "Load Project File" button
        var loadBtn = document.getElementById('btn-load-project');
        if (loadBtn) {
            var newLoadBtn = loadBtn.cloneNode(true);
            loadBtn.parentNode.replaceChild(newLoadBtn, loadBtn);
            newLoadBtn.addEventListener('click', function () {
                var fileInput = document.getElementById('input-import-project');
                if (fileInput) {
                    fileInput.value = '';
                    fileInput.click();
                }
            });
        }

        // Wire up the hidden file input for project import
        var importInput = document.getElementById('input-import-project');
        if (importInput) {
            var newImportInput = importInput.cloneNode(true);
            importInput.parentNode.replaceChild(newImportInput, importInput);
            newImportInput.addEventListener('change', function () {
                if (newImportInput.files && newImportInput.files.length > 0) {
                    _importProjectFile(newImportInput.files[0]);
                }
            });
        }
    }

    /**
     * Create a project card DOM element.
     * @param {Object} proj - Project header from listProjects().
     * @returns {HTMLElement}
     */
    function _createProjectCard(proj) {
        var card = document.createElement('div');
        card.className = 'project-card';
        card.setAttribute('data-project-id', proj.id);

        // Project name
        var nameEl = document.createElement('div');
        nameEl.className = 'project-name';
        nameEl.textContent = proj.name || 'Untitled';
        card.appendChild(nameEl);

        // Meta information
        var metaEl = document.createElement('div');
        metaEl.className = 'project-meta';

        var coderSpan = document.createElement('span');
        coderSpan.textContent = 'Coder: ' + (proj.coderId || 'N/A');
        metaEl.appendChild(coderSpan);

        if (proj.videoFileName) {
            var videoSpan = document.createElement('span');
            videoSpan.textContent = 'Video: ' + proj.videoFileName;
            metaEl.appendChild(videoSpan);
        }

        var annotSpan = document.createElement('span');
        annotSpan.textContent = 'Annotations: ' + (proj.annotationCount || 0);
        metaEl.appendChild(annotSpan);

        if (proj.modifiedAt) {
            var dateSpan = document.createElement('span');
            var d = new Date(proj.modifiedAt);
            dateSpan.textContent = 'Modified: ' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
            metaEl.appendChild(dateSpan);
        }

        card.appendChild(metaEl);

        // Delete button
        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'project-delete-btn';
        deleteBtn.title = 'Delete project';
        deleteBtn.textContent = '\u00D7'; // multiplication sign as X
        deleteBtn.setAttribute('data-project-id', proj.id);
        deleteBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var id = this.getAttribute('data-project-id');
            if (confirm('Delete this project? This cannot be undone.')) {
                EthoLogger.Store.deleteProject(id);
                _renderLandingProjects();
                EthoLogger.Utils.showToast('Project deleted');
            }
        });
        card.appendChild(deleteBtn);

        // Click card to resume project
        card.addEventListener('click', function () {
            var id = this.getAttribute('data-project-id');
            resumeProject(id);
        });

        return card;
    }

    /**
     * Import a project from a JSON file, save it, and resume.
     * @param {File} file
     */
    function _importProjectFile(file) {
        EthoLogger.Store.importProjectJSON(file).then(function (project) {
            EthoLogger.Store.saveProject(project);
            resumeProject(project.id);
            EthoLogger.Utils.showToast('Project imported: ' + project.name);
        })['catch'](function (err) {
            EthoLogger.Utils.showToast(err.message || 'Failed to import project');
        });
    }

    // ---------------------------------------------------------------
    // View: Setup
    // ---------------------------------------------------------------

    function showSetup() {
        _cleanupCurrentView();
        EthoLogger.Utils.showView('view-setup');

        var nameInput = document.getElementById('input-project-name');
        var coderInput = document.getElementById('input-coder-id');
        var nextBtn = document.getElementById('btn-setup-next');
        var nameError = document.getElementById('error-project-name');
        var coderError = document.getElementById('error-coder-id');

        // Focus the project name input
        if (nameInput) {
            nameInput.value = '';
            nameInput.focus();
        }
        if (coderInput) {
            coderInput.value = '';
        }

        // Clear errors
        _clearError(nameInput, nameError);
        _clearError(coderInput, coderError);

        // Wire up "Next" button
        if (nextBtn) {
            var newNextBtn = nextBtn.cloneNode(true);
            nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
            newNextBtn.addEventListener('click', function () {
                _handleSetupNext(nameInput, coderInput, nameError, coderError);
            });
        }

        // Allow Enter key in form to trigger next
        var setupForm = document.getElementById('setup-form');
        if (setupForm) {
            var newForm = setupForm.cloneNode(true);
            setupForm.parentNode.replaceChild(newForm, setupForm);
            // Re-query inputs inside the cloned form
            nameInput = newForm.querySelector('#input-project-name');
            coderInput = newForm.querySelector('#input-coder-id');
            nameError = newForm.querySelector('#error-project-name');
            coderError = newForm.querySelector('#error-coder-id');
            var clonedNext = newForm.querySelector('#btn-setup-next');

            if (nameInput) {
                nameInput.focus();
            }

            newForm.addEventListener('submit', function (e) {
                e.preventDefault();
                _handleSetupNext(nameInput, coderInput, nameError, coderError);
            });

            if (clonedNext) {
                clonedNext.addEventListener('click', function (e) {
                    e.preventDefault();
                    _handleSetupNext(nameInput, coderInput, nameError, coderError);
                });
            }

            // Wire up "Add Subject" button (must be after form clone)
            var subjectList = newForm.querySelector('#subject-list');
            var addSubjectBtn = newForm.querySelector('#btn-add-subject');
            if (addSubjectBtn && subjectList) {
                subjectList.innerHTML = '';
                addSubjectBtn.addEventListener('click', function () {
                    _addSubjectInput(subjectList);
                });
            }
        }
    }

    function _addSubjectInput(container) {
        var row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '6px';
        row.style.alignItems = 'center';
        row.style.marginBottom = '6px';

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'subject-name-input';
        input.placeholder = 'e.g. Mouse A';
        input.style.flex = '1';
        input.style.padding = '6px 8px';
        input.style.border = '1px solid #ccc';
        input.style.borderRadius = '4px';
        input.style.fontSize = '14px';
        row.appendChild(input);

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '\u00D7';
        removeBtn.style.padding = '4px 10px';
        removeBtn.style.fontSize = '16px';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.border = '1px solid #e57373';
        removeBtn.style.borderRadius = '4px';
        removeBtn.style.backgroundColor = '#ffebee';
        removeBtn.style.color = '#c62828';
        removeBtn.style.lineHeight = '1';
        removeBtn.addEventListener('click', function () {
            row.parentNode.removeChild(row);
        });
        row.appendChild(removeBtn);

        container.appendChild(row);
        input.focus();
    }

    function _parseSubjects() {
        var subjects = [];
        var inputs = document.querySelectorAll('.subject-name-input');
        for (var i = 0; i < inputs.length; i++) {
            var name = inputs[i].value.trim();
            if (name) {
                subjects.push({
                    id: EthoLogger.Utils.generateId('subj'),
                    name: name
                });
            }
        }
        return subjects;
    }

    function _handleSetupNext(nameInput, coderInput, nameError, coderError) {
        var name = nameInput ? nameInput.value.trim() : '';
        var coderId = coderInput ? coderInput.value.trim() : '';
        var valid = true;

        // Validate name
        if (!name) {
            _showError(nameInput, nameError, 'Project name is required.');
            valid = false;
        } else {
            _clearError(nameInput, nameError);
        }

        // Validate coder ID
        if (!coderId) {
            _showError(coderInput, coderError, 'Coder ID is required.');
            valid = false;
        } else {
            _clearError(coderInput, coderError);
        }

        if (!valid) return;

        // Create new project
        var now = new Date().toISOString();
        currentProject = {
            id: EthoLogger.Utils.generateId('proj'),
            name: name,
            coderId: coderId,
            createdAt: now,
            modifiedAt: now,
            ethogram: {
                id: EthoLogger.Utils.generateId('eth'),
                name: name + ' Ethogram',
                description: '',
                behaviors: [],
                mutualExclusivityGroups: []
            },
            subjects: _parseSubjects(),
            videoFileName: '',
            videoDuration: 0,
            annotations: [],
            undoStack: []
        };

        // Save to store
        EthoLogger.Store.saveProject(currentProject);
        _updateHeader();

        // Navigate to ethogram builder
        showEthogramBuilder();
    }

    // ---------------------------------------------------------------
    // View: Ethogram Builder
    // ---------------------------------------------------------------

    function showEthogramBuilder() {
        _cleanupCurrentView();
        EthoLogger.Utils.showView('view-ethogram');

        // Initialize the ethogram builder UI
        var contentEl = document.getElementById('ethogram-content');
        if (contentEl && EthoLogger.Ethogram) {
            EthoLogger.Ethogram.init(contentEl);
        }

        _wireEthogramToolbar();
    }

    /**
     * Wire up the ethogram toolbar buttons.
     */
    function _wireEthogramToolbar() {
        // "Load Ethogram JSON" button
        var loadEthBtn = document.getElementById('btn-load-ethogram');
        if (loadEthBtn) {
            var newLoadBtn = loadEthBtn.cloneNode(true);
            loadEthBtn.parentNode.replaceChild(newLoadBtn, loadEthBtn);
            newLoadBtn.addEventListener('click', function () {
                var fileInput = document.getElementById('input-import-ethogram');
                if (fileInput) {
                    fileInput.value = '';
                    fileInput.click();
                }
            });
        }

        // Hidden file input for ethogram import
        var importEthInput = document.getElementById('input-import-ethogram');
        if (importEthInput) {
            var newImportInput = importEthInput.cloneNode(true);
            importEthInput.parentNode.replaceChild(newImportInput, importEthInput);
            newImportInput.addEventListener('change', function () {
                if (newImportInput.files && newImportInput.files.length > 0) {
                    EthoLogger.Store.importEthogramJSON(newImportInput.files[0]).then(function (ethogram) {
                        if (currentProject) {
                            currentProject.ethogram.behaviors = ethogram.behaviors;
                            if (ethogram.name) {
                                currentProject.ethogram.name = ethogram.name;
                            }
                            if (ethogram.description !== undefined) {
                                currentProject.ethogram.description = ethogram.description;
                            }
                            EthoLogger.Store.saveProject(currentProject);
                            // Re-init ethogram UI
                            var contentEl = document.getElementById('ethogram-content');
                            if (contentEl && EthoLogger.Ethogram) {
                                EthoLogger.Ethogram.init(contentEl);
                            }
                            EthoLogger.Utils.showToast('Ethogram loaded: ' + (ethogram.name || 'imported'));
                        }
                    })['catch'](function (err) {
                        EthoLogger.Utils.showToast(err.message || 'Failed to import ethogram');
                    });
                }
            });
        }

        // "Load Sample Ethogram" button
        var sampleBtn = document.getElementById('btn-load-sample');
        if (sampleBtn) {
            var newSampleBtn = sampleBtn.cloneNode(true);
            sampleBtn.parentNode.replaceChild(newSampleBtn, sampleBtn);
            newSampleBtn.addEventListener('click', function () {
                _loadSampleEthogram();
            });
        }

        // "Save Ethogram JSON" button
        var saveEthBtn = document.getElementById('btn-save-ethogram');
        if (saveEthBtn) {
            var newSaveBtn = saveEthBtn.cloneNode(true);
            saveEthBtn.parentNode.replaceChild(newSaveBtn, saveEthBtn);
            newSaveBtn.addEventListener('click', function () {
                if (currentProject && currentProject.ethogram) {
                    EthoLogger.Store.exportEthogramJSON(currentProject.ethogram);
                }
            });
        }

        // "Next: Code Video" button
        var nextBtn = document.getElementById('btn-ethogram-next');
        if (nextBtn) {
            var newNextBtn = nextBtn.cloneNode(true);
            nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
            newNextBtn.addEventListener('click', function () {
                if (!currentProject || !currentProject.ethogram ||
                    !currentProject.ethogram.behaviors ||
                    currentProject.ethogram.behaviors.length === 0) {
                    EthoLogger.Utils.showToast('Please add at least one behavior before continuing.');
                    return;
                }
                showCoder();
            });
        }
    }

    /**
     * Load the sample ethogram JSON via XMLHttpRequest.
     * Uses XHR instead of fetch() because fetch() does not work
     * with the file:// protocol in most browsers.
     */
    function _loadSampleEthogram() {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'sample/sample-ethogram.json', true);
        xhr.responseType = 'text';

        xhr.onload = function () {
            if (xhr.status === 200 || xhr.status === 0) {
                // status 0 is normal for file:// protocol
                try {
                    var ethogram = JSON.parse(xhr.responseText);
                    if (!ethogram.behaviors || !Array.isArray(ethogram.behaviors)) {
                        EthoLogger.Utils.showToast('Invalid sample ethogram: missing behaviors array.');
                        return;
                    }

                    if (currentProject) {
                        currentProject.ethogram.behaviors = ethogram.behaviors;
                        if (ethogram.name) {
                            currentProject.ethogram.name = ethogram.name;
                        }
                        if (ethogram.description !== undefined) {
                            currentProject.ethogram.description = ethogram.description;
                        }
                        EthoLogger.Store.saveProject(currentProject);

                        // Re-init ethogram UI
                        var contentEl = document.getElementById('ethogram-content');
                        if (contentEl && EthoLogger.Ethogram) {
                            EthoLogger.Ethogram.init(contentEl);
                        }
                        EthoLogger.Utils.showToast('Sample ethogram loaded');
                    }
                } catch (e) {
                    EthoLogger.Utils.showToast('Failed to parse sample ethogram: ' + e.message);
                }
            } else {
                EthoLogger.Utils.showToast('Failed to load sample ethogram (HTTP ' + xhr.status + ').');
            }
        };

        xhr.onerror = function () {
            EthoLogger.Utils.showToast(
                'Could not load sample ethogram. If using file:// protocol, ' +
                'try opening Chrome with --allow-file-access-from-files flag, ' +
                'or manually load the file via "Load Ethogram JSON".'
            );
        };

        xhr.send();
    }

    // ---------------------------------------------------------------
    // View: Coder
    // ---------------------------------------------------------------

    function showCoder() {
        _cleanupCurrentView();
        EthoLogger.Utils.showView('view-coder');

        // Initialize the coder module
        if (EthoLogger.Coder && currentProject) {
            EthoLogger.Coder.init(currentProject);
        }

        // Initialize the timeline module
        if (EthoLogger.Timeline && currentProject) {
            EthoLogger.Timeline.init('timeline-canvas', currentProject);
        }

        // Wire up export CSV button in coder view
        var exportBtn = document.getElementById('btn-export-csv');
        if (exportBtn) {
            var newExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
            newExportBtn.addEventListener('click', function () {
                if (currentProject && EthoLogger.Exporter) {
                    EthoLogger.Exporter.exportCSV(currentProject);
                }
            });
        }

        // Update settings with lastProjectId
        if (currentProject) {
            EthoLogger.Store.updateSettings({ lastProjectId: currentProject.id });
        }

        _updateHeader();
    }

    // ---------------------------------------------------------------
    // Resume Project
    // ---------------------------------------------------------------

    /**
     * Load a project from the store and navigate to the appropriate view.
     * @param {string} id - Project ID.
     */
    function resumeProject(id) {
        var project = EthoLogger.Store.loadProject(id);
        if (!project) {
            EthoLogger.Utils.showToast('Project not found');
            return;
        }

        currentProject = project;
        _updateHeader();

        var hasBehaviors = project.ethogram &&
            project.ethogram.behaviors &&
            project.ethogram.behaviors.length > 0;
        var hasVideo = project.videoDuration > 0;

        if (hasBehaviors && hasVideo) {
            // Project has ethogram and video — go straight to coder
            showCoder();
        } else if (hasBehaviors) {
            // Has ethogram but no video yet — show ethogram builder
            // (they can proceed to coder from there)
            showEthogramBuilder();
        } else {
            // No ethogram behaviors — start at ethogram builder
            showEthogramBuilder();
        }
    }

    // ---------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------

    /**
     * Clean up the current view before transitioning.
     * Calls destroy methods on modules that need teardown.
     */
    function _cleanupCurrentView() {
        // Destroy coder if it exists (stops playback, removes listeners)
        if (EthoLogger.Coder && typeof EthoLogger.Coder.destroy === 'function') {
            EthoLogger.Coder.destroy();
        }

        // Destroy timeline if it exists
        if (EthoLogger.Timeline && typeof EthoLogger.Timeline.destroy === 'function') {
            EthoLogger.Timeline.destroy();
        }
    }

    // ---------------------------------------------------------------
    // Help Overlay
    // ---------------------------------------------------------------

    /**
     * Show the help overlay with keyboard shortcuts.
     */
    function showHelp() {
        var overlay = document.getElementById('help-overlay');
        if (!overlay) return;

        // Populate help content
        _renderHelpContent();

        overlay.classList.add('active');

        // Wire up close button
        var closeBtn = overlay.querySelector('.help-close');
        if (closeBtn) {
            var newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.addEventListener('click', function () {
                hideHelp();
            });
        }

        // Wire up backdrop click
        var backdrop = overlay.querySelector('.help-backdrop');
        if (backdrop) {
            var newBackdrop = backdrop.cloneNode(true);
            backdrop.parentNode.replaceChild(newBackdrop, backdrop);
            newBackdrop.addEventListener('click', function () {
                hideHelp();
            });
        }
    }

    /**
     * Hide the help overlay.
     */
    function hideHelp() {
        var overlay = document.getElementById('help-overlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }

    /**
     * Render the help overlay content: shortcuts table and ethogram bindings.
     */
    function _renderHelpContent() {
        var helpBody = document.getElementById('help-body');
        if (!helpBody) return;

        helpBody.innerHTML = '';

        // Section: Global keyboard shortcuts
        var shortcutsTitle = document.createElement('h3');
        shortcutsTitle.textContent = 'Keyboard Shortcuts';
        shortcutsTitle.style.fontSize = '15px';
        shortcutsTitle.style.fontWeight = '600';
        shortcutsTitle.style.marginBottom = '12px';
        helpBody.appendChild(shortcutsTitle);

        var shortcuts = [
            { key: 'Space', desc: 'Play / Pause' },
            { key: ',', desc: 'Step back one frame' },
            { key: '.', desc: 'Step forward one frame' },
            { key: '\u2190 Arrow', desc: 'Seek back 5 seconds' },
            { key: '\u2192 Arrow', desc: 'Seek forward 5 seconds' },
            { key: 'Ctrl+Z', desc: 'Undo last action' },
            { key: '?', desc: 'Toggle help overlay' }
        ];

        var shortcutList = document.createElement('ul');
        shortcutList.className = 'shortcut-list';

        for (var i = 0; i < shortcuts.length; i++) {
            var li = document.createElement('li');

            var descSpan = document.createElement('span');
            descSpan.className = 'shortcut-desc';
            descSpan.textContent = shortcuts[i].desc;
            li.appendChild(descSpan);

            var keySpan = document.createElement('span');
            keySpan.className = 'shortcut-key';
            keySpan.textContent = shortcuts[i].key;
            li.appendChild(keySpan);

            shortcutList.appendChild(li);
        }

        helpBody.appendChild(shortcutList);

        // Section: Subject key bindings (if subjects are defined)
        if (currentProject && currentProject.subjects && currentProject.subjects.length > 0) {
            var subjTitle = document.createElement('h3');
            subjTitle.textContent = 'Subject Key Bindings';
            subjTitle.style.fontSize = '15px';
            subjTitle.style.fontWeight = '600';
            subjTitle.style.marginTop = '20px';
            subjTitle.style.marginBottom = '12px';
            helpBody.appendChild(subjTitle);

            var subjList = document.createElement('ul');
            subjList.className = 'shortcut-list';

            for (var si = 0; si < currentProject.subjects.length; si++) {
                var subj = currentProject.subjects[si];
                var sLi = document.createElement('li');

                var sDescSpan = document.createElement('span');
                sDescSpan.className = 'shortcut-desc';
                sDescSpan.textContent = subj.name;
                sLi.appendChild(sDescSpan);

                var sKeySpan = document.createElement('span');
                sKeySpan.className = 'shortcut-key';
                sKeySpan.textContent = String(si + 1);
                sLi.appendChild(sKeySpan);

                subjList.appendChild(sLi);
            }

            helpBody.appendChild(subjList);
        }

        // Section: Ethogram key bindings (if a project is active)
        if (currentProject && currentProject.ethogram &&
            currentProject.ethogram.behaviors &&
            currentProject.ethogram.behaviors.length > 0) {

            var ethTitle = document.createElement('h3');
            ethTitle.textContent = 'Behavior Key Bindings';
            ethTitle.style.fontSize = '15px';
            ethTitle.style.fontWeight = '600';
            ethTitle.style.marginTop = '20px';
            ethTitle.style.marginBottom = '12px';
            helpBody.appendChild(ethTitle);

            var ethList = document.createElement('ul');
            ethList.className = 'shortcut-list';

            var behaviors = currentProject.ethogram.behaviors;
            for (var j = 0; j < behaviors.length; j++) {
                var b = behaviors[j];
                var bLi = document.createElement('li');

                var bDescSpan = document.createElement('span');
                bDescSpan.className = 'shortcut-desc';
                bDescSpan.textContent = b.name + ' (' + b.type + ')';
                bLi.appendChild(bDescSpan);

                var bKeySpan = document.createElement('span');
                bKeySpan.className = 'shortcut-key';
                bKeySpan.textContent = (b.key || '').toUpperCase();
                bLi.appendChild(bKeySpan);

                ethList.appendChild(bLi);
            }

            helpBody.appendChild(ethList);
        }

        // Footer hint
        var hint = document.createElement('p');
        hint.textContent = 'Press ? or Escape to close';
        hint.style.marginTop = '20px';
        hint.style.textAlign = 'center';
        hint.style.fontSize = '12px';
        hint.style.color = '#999';
        helpBody.appendChild(hint);
    }

    /**
     * Set up the global keyboard shortcut for the help overlay.
     */
    function _setupHelpShortcut() {
        document.addEventListener('keydown', function (e) {
            // Skip if focus is in an input, textarea, or select
            var tag = e.target.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                return;
            }

            var overlay = document.getElementById('help-overlay');
            var isHelpVisible = overlay && overlay.classList.contains('active');

            if (e.key === '?') {
                e.preventDefault();
                if (isHelpVisible) {
                    hideHelp();
                } else {
                    showHelp();
                }
            } else if (e.key === 'Escape' && isHelpVisible) {
                e.preventDefault();
                hideHelp();
            }
        });
    }

    // ---------------------------------------------------------------
    // Form validation helpers
    // ---------------------------------------------------------------

    function _showError(inputEl, errorEl, message) {
        if (inputEl) {
            inputEl.classList.add('error');
        }
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = '';
        }
    }

    function _clearError(inputEl, errorEl) {
        if (inputEl) {
            inputEl.classList.remove('error');
        }
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
    }

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------

    /**
     * Returns the currently active project object (or null).
     */
    function getCurrentProject() {
        return currentProject;
    }

    EthoLogger.App = {
        init: init,
        showLanding: showLanding,
        showSetup: showSetup,
        showEthogramBuilder: showEthogramBuilder,
        showCoder: showCoder,
        resumeProject: resumeProject,
        getCurrentProject: getCurrentProject,
        showHelp: showHelp,
        hideHelp: hideHelp
    };
})();

// ---------------------------------------------------------------
// Boot
// ---------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
    EthoLogger.App.init();
});
