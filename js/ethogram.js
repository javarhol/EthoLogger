/**
 * EthoLogger Ethogram Module
 * Handles ethogram building: behavior CRUD, validation, and UI rendering.
 * Depends on EthoLogger.Utils (utils.js) and EthoLogger.Store (store.js).
 */
(function () {
    'use strict';

    window.EthoLogger = window.EthoLogger || {};

    // ---------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------

    var DEFAULT_COLORS = [
        '#4CAF50', '#2196F3', '#F44336', '#FF9800',
        '#9C27B0', '#E91E63', '#00BCD4', '#FFEB3B',
        '#607D8B', '#795548', '#8BC34A', '#3F51B5'
    ];

    var RESERVED_KEYS = [' ', ',', '.', '?', '[', ']', 'arrowleft', 'arrowright',
        '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

    var CATEGORY_SUGGESTIONS = [
        'Locomotion', 'Maintenance', 'Social', 'Feeding',
        'Resting', 'Agonistic', 'Exploration', 'Anxiety'
    ];

    // ---------------------------------------------------------------
    // Module state
    // ---------------------------------------------------------------

    var _containerEl = null;
    var _project = null;
    var _editingBehaviorId = null;

    // ---------------------------------------------------------------
    // Palette helpers
    // ---------------------------------------------------------------

    /**
     * Returns the array of 12 distinct default colors for auto-assignment.
     */
    function getDefaultColors() {
        return DEFAULT_COLORS.slice();
    }

    /**
     * Returns the first color from the default palette not yet used by
     * any behavior in the given ethogram. Cycles back if all are used.
     */
    function getNextColor(ethogram) {
        var usedColors = {};
        var behaviors = (ethogram && ethogram.behaviors) || [];
        for (var i = 0; i < behaviors.length; i++) {
            if (behaviors[i].color) {
                usedColors[behaviors[i].color.toLowerCase()] = true;
            }
        }

        for (var j = 0; j < DEFAULT_COLORS.length; j++) {
            if (!usedColors[DEFAULT_COLORS[j].toLowerCase()]) {
                return DEFAULT_COLORS[j];
            }
        }

        // All colors used; cycle based on behavior count
        return DEFAULT_COLORS[behaviors.length % DEFAULT_COLORS.length];
    }

    // ---------------------------------------------------------------
    // Validation
    // ---------------------------------------------------------------

    /**
     * Validate a keyboard shortcut key.
     * @param {string} key - The key to validate.
     * @param {string|null} excludeId - Behavior ID to exclude from duplicate check (for edits).
     * @returns {{ valid: boolean, error: string|null }}
     */
    function validateKey(key, excludeId) {
        if (!key || typeof key !== 'string') {
            return { valid: false, error: 'Key is required.' };
        }

        if (key.length !== 1) {
            return { valid: false, error: 'Key must be a single character.' };
        }

        var normalizedKey = key.toLowerCase();

        if (RESERVED_KEYS.indexOf(normalizedKey) !== -1) {
            return { valid: false, error: 'Key "' + key + '" is reserved and cannot be used.' };
        }

        // Check for duplicates in the current ethogram
        if (_project && _project.ethogram && _project.ethogram.behaviors) {
            var behaviors = _project.ethogram.behaviors;
            for (var i = 0; i < behaviors.length; i++) {
                if (behaviors[i].key && behaviors[i].key.toLowerCase() === normalizedKey) {
                    if (excludeId && behaviors[i].id === excludeId) {
                        continue;
                    }
                    return { valid: false, error: 'Key "' + key + '" is already assigned to "' + behaviors[i].name + '".' };
                }
            }
        }

        return { valid: true, error: null };
    }

    // ---------------------------------------------------------------
    // Behavior CRUD
    // ---------------------------------------------------------------

    /**
     * Create a new behavior and add it to the current ethogram.
     * @param {Object} data - { name, category, type, key, color }
     * @returns {{ ok: boolean, behavior?: Object, error?: string }}
     */
    function createBehavior(data) {
        if (!_project || !_project.ethogram) {
            return { ok: false, error: 'No project or ethogram loaded.' };
        }

        // Validate name
        if (!data.name || !data.name.trim()) {
            return { ok: false, error: 'Behavior name is required.' };
        }

        // Validate key
        if (!data.key || !data.key.trim()) {
            return { ok: false, error: 'Keyboard shortcut key is required.' };
        }

        var keyResult = validateKey(data.key, null);
        if (!keyResult.valid) {
            return { ok: false, error: keyResult.error };
        }

        // Validate color
        if (!data.color) {
            return { ok: false, error: 'Color is required.' };
        }

        var behavior = {
            id: EthoLogger.Utils.generateId('b'),
            name: data.name.trim(),
            category: (data.category || '').trim(),
            type: data.type === 'state' ? 'state' : 'point',
            key: data.key.toLowerCase(),
            color: data.color,
            modifiers: data.modifiers || []
        };

        _project.ethogram.behaviors.push(behavior);
        _render();
        _autoSave();

        return { ok: true, behavior: behavior };
    }

    /**
     * Update an existing behavior by ID.
     * @param {string} id - Behavior ID.
     * @param {Object} data - Fields to update.
     * @returns {{ ok: boolean, behavior?: Object, error?: string }}
     */
    function updateBehavior(id, data) {
        if (!_project || !_project.ethogram) {
            return { ok: false, error: 'No project or ethogram loaded.' };
        }

        var behavior = _findBehavior(id);
        if (!behavior) {
            return { ok: false, error: 'Behavior not found.' };
        }

        // Validate name if provided
        if (data.hasOwnProperty('name')) {
            if (!data.name || !data.name.trim()) {
                return { ok: false, error: 'Behavior name is required.' };
            }
        }

        // Validate key if provided
        if (data.hasOwnProperty('key')) {
            if (!data.key || !data.key.trim()) {
                return { ok: false, error: 'Keyboard shortcut key is required.' };
            }
            var keyResult = validateKey(data.key, id);
            if (!keyResult.valid) {
                return { ok: false, error: keyResult.error };
            }
        }

        // Validate color if provided
        if (data.hasOwnProperty('color') && !data.color) {
            return { ok: false, error: 'Color is required.' };
        }

        // Apply updates
        if (data.hasOwnProperty('name')) behavior.name = data.name.trim();
        if (data.hasOwnProperty('category')) behavior.category = (data.category || '').trim();
        if (data.hasOwnProperty('type')) behavior.type = data.type === 'state' ? 'state' : 'point';
        if (data.hasOwnProperty('key')) behavior.key = data.key.toLowerCase();
        if (data.hasOwnProperty('color')) behavior.color = data.color;
        if (data.hasOwnProperty('modifiers')) behavior.modifiers = data.modifiers;

        _render();
        _autoSave();

        return { ok: true, behavior: behavior };
    }

    /**
     * Remove a behavior by ID.
     * @param {string} id - Behavior ID.
     */
    function removeBehavior(id) {
        if (!_project || !_project.ethogram) return;

        var behaviors = _project.ethogram.behaviors;
        for (var i = 0; i < behaviors.length; i++) {
            if (behaviors[i].id === id) {
                behaviors.splice(i, 1);
                break;
            }
        }

        // If we were editing this behavior, cancel edit mode
        if (_editingBehaviorId === id) {
            _editingBehaviorId = null;
        }

        _render();
        _autoSave();
    }

    /**
     * Build a key-to-behavior mapping for a given ethogram.
     * @param {Object} ethogram - The ethogram object.
     * @returns {Object} Map of lowercase key -> behavior object.
     */
    function getKeyMap(ethogram) {
        var map = {};
        var behaviors = (ethogram && ethogram.behaviors) || [];
        for (var i = 0; i < behaviors.length; i++) {
            if (behaviors[i].key) {
                map[behaviors[i].key.toLowerCase()] = behaviors[i];
            }
        }
        return map;
    }

    // ---------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------

    function _findBehavior(id) {
        if (!_project || !_project.ethogram) return null;
        var behaviors = _project.ethogram.behaviors;
        for (var i = 0; i < behaviors.length; i++) {
            if (behaviors[i].id === id) {
                return behaviors[i];
            }
        }
        return null;
    }

    function _autoSave() {
        if (_project && EthoLogger.Store && EthoLogger.Store.autoSave) {
            EthoLogger.Store.autoSave(_project);
        }
    }

    // ---------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------

    /**
     * Full re-render of the ethogram builder UI into the container.
     */
    function _render() {
        if (!_containerEl || !_project || !_project.ethogram) return;

        _containerEl.innerHTML = '';

        // Title area
        var header = document.createElement('div');
        header.className = 'ethogram-header';

        var title = document.createElement('h3');
        title.textContent = _project.ethogram.name || 'Ethogram';
        header.appendChild(title);

        if (_project.ethogram.description) {
            var desc = document.createElement('p');
            desc.className = 'ethogram-description';
            desc.textContent = _project.ethogram.description;
            header.appendChild(desc);
        }

        _containerEl.appendChild(header);

        // Form section
        var formContainer = document.createElement('div');
        formContainer.className = 'ethogram-form-container';
        _containerEl.appendChild(formContainer);

        var editingBehavior = _editingBehaviorId ? _findBehavior(_editingBehaviorId) : null;
        renderBehaviorForm(formContainer, editingBehavior);

        // Behavior list section
        var listContainer = document.createElement('div');
        listContainer.className = 'ethogram-list-container';
        _containerEl.appendChild(listContainer);

        renderBehaviorList(_project.ethogram, listContainer);

        // Mutual exclusivity groups section
        var exclusivityContainer = document.createElement('div');
        exclusivityContainer.className = 'exclusivity-groups-container';
        _containerEl.appendChild(exclusivityContainer);

        _renderExclusivityGroups(exclusivityContainer);
    }

    /**
     * Render the behavior list table/cards into a given container.
     * @param {Object} ethogram - The ethogram object.
     * @param {HTMLElement} containerEl - DOM element to render into.
     */
    function renderBehaviorList(ethogram, containerEl) {
        containerEl.innerHTML = '';

        var behaviors = (ethogram && ethogram.behaviors) || [];

        if (behaviors.length === 0) {
            var empty = document.createElement('p');
            empty.className = 'ethogram-empty';
            empty.textContent = 'No behaviors defined yet. Use the form above to add behaviors.';
            empty.style.color = '#888';
            empty.style.fontStyle = 'italic';
            empty.style.padding = '16px 0';
            containerEl.appendChild(empty);
            return;
        }

        var table = document.createElement('table');
        table.className = 'ethogram-table';
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        // Header row
        var thead = document.createElement('thead');
        var headerRow = document.createElement('tr');
        var headers = ['Color', 'Key', 'Name', 'Category', 'Type', 'Modifiers', 'Actions'];
        for (var h = 0; h < headers.length; h++) {
            var th = document.createElement('th');
            th.textContent = headers[h];
            th.style.textAlign = 'left';
            th.style.padding = '8px 12px';
            th.style.borderBottom = '2px solid #ddd';
            th.style.fontSize = '12px';
            th.style.textTransform = 'uppercase';
            th.style.color = '#666';
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body rows
        var tbody = document.createElement('tbody');
        for (var i = 0; i < behaviors.length; i++) {
            var b = behaviors[i];
            var row = document.createElement('tr');
            row.style.borderBottom = '1px solid #eee';

            // Color swatch
            var tdColor = document.createElement('td');
            tdColor.style.padding = '8px 12px';
            var swatch = document.createElement('span');
            swatch.style.display = 'inline-block';
            swatch.style.width = '20px';
            swatch.style.height = '20px';
            swatch.style.borderRadius = '4px';
            swatch.style.backgroundColor = b.color || '#999';
            swatch.style.border = '1px solid rgba(0,0,0,0.15)';
            tdColor.appendChild(swatch);
            row.appendChild(tdColor);

            // Key badge
            var tdKey = document.createElement('td');
            tdKey.style.padding = '8px 12px';
            var keyBadge = document.createElement('kbd');
            keyBadge.textContent = (b.key || '').toUpperCase();
            keyBadge.style.display = 'inline-block';
            keyBadge.style.minWidth = '24px';
            keyBadge.style.textAlign = 'center';
            keyBadge.style.padding = '2px 8px';
            keyBadge.style.fontFamily = 'monospace';
            keyBadge.style.fontSize = '13px';
            keyBadge.style.fontWeight = 'bold';
            keyBadge.style.backgroundColor = '#f4f4f4';
            keyBadge.style.border = '1px solid #ccc';
            keyBadge.style.borderRadius = '4px';
            keyBadge.style.boxShadow = '0 1px 0 rgba(0,0,0,0.1)';
            tdKey.appendChild(keyBadge);
            row.appendChild(tdKey);

            // Name
            var tdName = document.createElement('td');
            tdName.style.padding = '8px 12px';
            tdName.style.fontWeight = '500';
            tdName.textContent = b.name || '';
            row.appendChild(tdName);

            // Category
            var tdCategory = document.createElement('td');
            tdCategory.style.padding = '8px 12px';
            tdCategory.style.color = '#666';
            tdCategory.textContent = b.category || '';
            row.appendChild(tdCategory);

            // Type badge
            var tdType = document.createElement('td');
            tdType.style.padding = '8px 12px';
            var typeBadge = document.createElement('span');
            typeBadge.textContent = b.type === 'state' ? 'State' : 'Point';
            typeBadge.style.display = 'inline-block';
            typeBadge.style.padding = '2px 8px';
            typeBadge.style.fontSize = '11px';
            typeBadge.style.fontWeight = '600';
            typeBadge.style.borderRadius = '10px';
            typeBadge.style.textTransform = 'uppercase';
            if (b.type === 'state') {
                typeBadge.style.backgroundColor = '#E3F2FD';
                typeBadge.style.color = '#1565C0';
            } else {
                typeBadge.style.backgroundColor = '#FFF3E0';
                typeBadge.style.color = '#E65100';
            }
            tdType.appendChild(typeBadge);
            row.appendChild(tdType);

            // Modifiers
            var tdMod = document.createElement('td');
            tdMod.style.padding = '8px 12px';
            tdMod.style.color = '#666';
            tdMod.style.fontSize = '12px';
            var mods = b.modifiers || [];
            if (mods.length === 0) {
                tdMod.textContent = '--';
            } else {
                var modParts = [];
                for (var mi = 0; mi < mods.length; mi++) {
                    modParts.push(mods[mi].name + '(' + mods[mi].options.length + ')');
                }
                tdMod.textContent = modParts.join(', ');
            }
            row.appendChild(tdMod);

            // Actions
            var tdActions = document.createElement('td');
            tdActions.style.padding = '8px 12px';

            var editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'btn btn-sm btn-secondary';
            editBtn.style.marginRight = '4px';
            editBtn.style.padding = '4px 10px';
            editBtn.style.fontSize = '12px';
            editBtn.style.cursor = 'pointer';
            editBtn.style.border = '1px solid #ccc';
            editBtn.style.borderRadius = '4px';
            editBtn.style.backgroundColor = '#f8f8f8';
            editBtn.setAttribute('data-behavior-id', b.id);
            editBtn.addEventListener('click', _handleEditClick);
            tdActions.appendChild(editBtn);

            var deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'btn btn-sm btn-danger';
            deleteBtn.style.padding = '4px 10px';
            deleteBtn.style.fontSize = '12px';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.style.border = '1px solid #e57373';
            deleteBtn.style.borderRadius = '4px';
            deleteBtn.style.backgroundColor = '#ffebee';
            deleteBtn.style.color = '#c62828';
            deleteBtn.setAttribute('data-behavior-id', b.id);
            deleteBtn.addEventListener('click', _handleDeleteClick);
            tdActions.appendChild(deleteBtn);

            row.appendChild(tdActions);
            tbody.appendChild(row);
        }
        table.appendChild(tbody);
        containerEl.appendChild(table);
    }

    /**
     * Render the add/edit behavior form into a given container.
     * @param {HTMLElement} containerEl - DOM element to render into.
     * @param {Object|null} editingBehavior - Behavior being edited, or null for add mode.
     */
    function renderBehaviorForm(containerEl, editingBehavior) {
        containerEl.innerHTML = '';

        var isEdit = !!editingBehavior;

        var form = document.createElement('form');
        form.className = 'ethogram-form';
        form.style.display = 'flex';
        form.style.flexWrap = 'wrap';
        form.style.gap = '12px';
        form.style.alignItems = 'flex-end';
        form.style.padding = '16px';
        form.style.backgroundColor = '#f9f9f9';
        form.style.borderRadius = '8px';
        form.style.border = '1px solid #e0e0e0';
        form.style.marginBottom = '16px';
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            _handleFormSubmit(form);
        });

        // Name field
        var nameGroup = _createFieldGroup('Name', 'text', 'behavior-name', {
            required: true,
            placeholder: 'e.g. Grooming',
            value: isEdit ? editingBehavior.name : ''
        });
        nameGroup.style.flex = '1 1 160px';
        form.appendChild(nameGroup);

        // Category field with datalist
        var catGroup = _createFieldGroup('Category', 'text', 'behavior-category', {
            placeholder: 'e.g. Maintenance',
            value: isEdit ? (editingBehavior.category || '') : '',
            list: 'category-suggestions'
        });
        catGroup.style.flex = '1 1 140px';

        // Add datalist for category suggestions
        var datalist = document.createElement('datalist');
        datalist.id = 'category-suggestions';
        for (var s = 0; s < CATEGORY_SUGGESTIONS.length; s++) {
            var opt = document.createElement('option');
            opt.value = CATEGORY_SUGGESTIONS[s];
            datalist.appendChild(opt);
        }
        catGroup.appendChild(datalist);
        form.appendChild(catGroup);

        // Type field
        var typeGroup = document.createElement('div');
        typeGroup.className = 'form-group';
        typeGroup.style.flex = '0 0 140px';
        var typeLabel = document.createElement('label');
        typeLabel.textContent = 'Type';
        typeLabel.style.display = 'block';
        typeLabel.style.fontSize = '12px';
        typeLabel.style.fontWeight = '600';
        typeLabel.style.marginBottom = '4px';
        typeLabel.style.color = '#555';
        typeGroup.appendChild(typeLabel);

        var typeSelect = document.createElement('select');
        typeSelect.name = 'behavior-type';
        typeSelect.style.width = '100%';
        typeSelect.style.padding = '6px 8px';
        typeSelect.style.border = '1px solid #ccc';
        typeSelect.style.borderRadius = '4px';
        typeSelect.style.fontSize = '14px';

        var optState = document.createElement('option');
        optState.value = 'state';
        optState.textContent = 'State Event';
        typeSelect.appendChild(optState);

        var optPoint = document.createElement('option');
        optPoint.value = 'point';
        optPoint.textContent = 'Point Event';
        typeSelect.appendChild(optPoint);

        if (isEdit) {
            typeSelect.value = editingBehavior.type || 'state';
        }
        typeGroup.appendChild(typeSelect);
        form.appendChild(typeGroup);

        // Key field
        var keyGroup = _createFieldGroup('Key', 'text', 'behavior-key', {
            required: true,
            maxlength: '1',
            placeholder: 'e.g. g',
            value: isEdit ? (editingBehavior.key || '') : ''
        });
        keyGroup.style.flex = '0 0 80px';

        var keyInput = keyGroup.querySelector('input');
        keyInput.style.fontFamily = 'monospace';
        keyInput.style.fontSize = '16px';
        keyInput.style.textAlign = 'center';
        keyInput.style.textTransform = 'lowercase';

        // Key validation feedback element
        var keyFeedback = document.createElement('span');
        keyFeedback.className = 'key-feedback';
        keyFeedback.style.fontSize = '12px';
        keyFeedback.style.marginTop = '2px';
        keyFeedback.style.display = 'block';
        keyFeedback.style.minHeight = '16px';
        keyGroup.appendChild(keyFeedback);

        // Real-time key validation
        keyInput.addEventListener('input', function () {
            var val = keyInput.value.toLowerCase();
            keyInput.value = val;

            if (!val) {
                keyFeedback.textContent = '';
                keyFeedback.style.color = '';
                keyInput.style.borderColor = '#ccc';
                return;
            }

            var excludeId = isEdit ? editingBehavior.id : null;
            var result = validateKey(val, excludeId);

            if (result.valid) {
                keyFeedback.textContent = '\u2713 Available';
                keyFeedback.style.color = '#2E7D32';
                keyInput.style.borderColor = '#4CAF50';
            } else {
                keyFeedback.textContent = result.error;
                keyFeedback.style.color = '#C62828';
                keyInput.style.borderColor = '#F44336';
            }
        });

        form.appendChild(keyGroup);

        // Color field
        var colorGroup = document.createElement('div');
        colorGroup.className = 'form-group';
        colorGroup.style.flex = '0 0 80px';
        var colorLabel = document.createElement('label');
        colorLabel.textContent = 'Color';
        colorLabel.style.display = 'block';
        colorLabel.style.fontSize = '12px';
        colorLabel.style.fontWeight = '600';
        colorLabel.style.marginBottom = '4px';
        colorLabel.style.color = '#555';
        colorGroup.appendChild(colorLabel);

        var colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.name = 'behavior-color';
        colorInput.style.width = '100%';
        colorInput.style.height = '34px';
        colorInput.style.border = '1px solid #ccc';
        colorInput.style.borderRadius = '4px';
        colorInput.style.cursor = 'pointer';
        colorInput.style.padding = '2px';

        if (isEdit) {
            colorInput.value = editingBehavior.color || '#4CAF50';
        } else {
            colorInput.value = _project && _project.ethogram
                ? getNextColor(_project.ethogram)
                : DEFAULT_COLORS[0];
        }
        colorGroup.appendChild(colorInput);
        form.appendChild(colorGroup);

        // Modifiers section
        var modSection = document.createElement('div');
        modSection.className = 'modifier-editor';
        modSection.style.flex = '1 1 100%';

        var modLabel = document.createElement('label');
        modLabel.textContent = 'Modifiers';
        modLabel.style.display = 'block';
        modLabel.style.fontSize = '12px';
        modLabel.style.fontWeight = '600';
        modLabel.style.marginBottom = '6px';
        modLabel.style.color = '#555';
        modSection.appendChild(modLabel);

        var modHint = document.createElement('p');
        modHint.style.fontSize = '11px';
        modHint.style.color = '#888';
        modHint.style.margin = '0 0 8px';
        modHint.textContent = 'Optional. Add modifier sets (e.g. Target: self, other, object).';
        modSection.appendChild(modHint);

        var modList = document.createElement('div');
        modList.className = 'modifier-set-list';
        modSection.appendChild(modList);

        // Populate existing modifiers
        var existingMods = (isEdit && editingBehavior.modifiers) ? editingBehavior.modifiers : [];
        for (var m = 0; m < existingMods.length; m++) {
            _appendModifierRow(modList, existingMods[m].name, existingMods[m].options.join(', '));
        }

        var addModBtn = document.createElement('button');
        addModBtn.type = 'button';
        addModBtn.textContent = '+ Add Modifier Set';
        addModBtn.style.padding = '4px 10px';
        addModBtn.style.fontSize = '12px';
        addModBtn.style.cursor = 'pointer';
        addModBtn.style.border = '1px solid #ccc';
        addModBtn.style.borderRadius = '4px';
        addModBtn.style.backgroundColor = '#f8f8f8';
        addModBtn.style.marginTop = '4px';
        addModBtn.addEventListener('click', function () {
            _appendModifierRow(modList, '', '');
        });
        modSection.appendChild(addModBtn);
        form.appendChild(modSection);

        // Buttons
        var btnGroup = document.createElement('div');
        btnGroup.className = 'form-group';
        btnGroup.style.flex = '0 0 auto';
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '8px';
        btnGroup.style.alignItems = 'flex-end';

        var submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.textContent = isEdit ? 'Update Behavior' : 'Add Behavior';
        submitBtn.style.padding = '6px 16px';
        submitBtn.style.fontSize = '14px';
        submitBtn.style.fontWeight = '600';
        submitBtn.style.border = 'none';
        submitBtn.style.borderRadius = '4px';
        submitBtn.style.cursor = 'pointer';
        submitBtn.style.color = '#fff';
        submitBtn.style.backgroundColor = isEdit ? '#FF9800' : '#4CAF50';
        btnGroup.appendChild(submitBtn);

        if (isEdit) {
            var cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.padding = '6px 16px';
            cancelBtn.style.fontSize = '14px';
            cancelBtn.style.border = '1px solid #ccc';
            cancelBtn.style.borderRadius = '4px';
            cancelBtn.style.cursor = 'pointer';
            cancelBtn.style.backgroundColor = '#f8f8f8';
            cancelBtn.addEventListener('click', function () {
                _editingBehaviorId = null;
                _render();
            });
            btnGroup.appendChild(cancelBtn);
        }

        form.appendChild(btnGroup);
        containerEl.appendChild(form);
    }

    // ---------------------------------------------------------------
    // Internal UI helpers
    // ---------------------------------------------------------------

    /**
     * Create a form field group (label + input).
     */
    function _createFieldGroup(labelText, inputType, inputName, attrs) {
        var group = document.createElement('div');
        group.className = 'form-group';

        var label = document.createElement('label');
        label.textContent = labelText;
        label.style.display = 'block';
        label.style.fontSize = '12px';
        label.style.fontWeight = '600';
        label.style.marginBottom = '4px';
        label.style.color = '#555';
        group.appendChild(label);

        var input = document.createElement('input');
        input.type = inputType;
        input.name = inputName;
        input.style.width = '100%';
        input.style.padding = '6px 8px';
        input.style.border = '1px solid #ccc';
        input.style.borderRadius = '4px';
        input.style.fontSize = '14px';
        input.style.boxSizing = 'border-box';

        if (attrs) {
            if (attrs.required) input.required = true;
            if (attrs.placeholder) input.placeholder = attrs.placeholder;
            if (attrs.value) input.value = attrs.value;
            if (attrs.maxlength) input.maxLength = parseInt(attrs.maxlength, 10);
            if (attrs.list) input.setAttribute('list', attrs.list);
        }

        group.appendChild(input);
        return group;
    }

    // ---------------------------------------------------------------
    // Modifier helpers
    // ---------------------------------------------------------------

    function _appendModifierRow(container, nameVal, optionsVal) {
        var row = document.createElement('div');
        row.className = 'modifier-set-row';
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.style.marginBottom = '6px';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'modifier-set-name';
        nameInput.placeholder = 'Set name (e.g. Target)';
        nameInput.value = nameVal || '';
        nameInput.style.flex = '0 0 140px';
        nameInput.style.padding = '4px 8px';
        nameInput.style.fontSize = '13px';
        nameInput.style.border = '1px solid #ccc';
        nameInput.style.borderRadius = '4px';
        row.appendChild(nameInput);

        var optInput = document.createElement('input');
        optInput.type = 'text';
        optInput.className = 'modifier-set-options';
        optInput.placeholder = 'Options (comma-separated)';
        optInput.value = optionsVal || '';
        optInput.style.flex = '1';
        optInput.style.padding = '4px 8px';
        optInput.style.fontSize = '13px';
        optInput.style.border = '1px solid #ccc';
        optInput.style.borderRadius = '4px';
        row.appendChild(optInput);

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '\u00D7';
        removeBtn.style.padding = '2px 8px';
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
    }

    function _parseModifiers(formEl) {
        var modifiers = [];
        var rows = formEl.querySelectorAll('.modifier-set-row');
        for (var i = 0; i < rows.length; i++) {
            var nameInput = rows[i].querySelector('.modifier-set-name');
            var optInput = rows[i].querySelector('.modifier-set-options');
            var name = nameInput ? nameInput.value.trim() : '';
            var optStr = optInput ? optInput.value.trim() : '';
            if (!name || !optStr) continue;
            var options = optStr.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
            if (options.length === 0) continue;
            modifiers.push({
                id: EthoLogger.Utils.generateId('mod'),
                name: name,
                options: options
            });
        }
        return modifiers;
    }

    // ---------------------------------------------------------------
    // Mutual Exclusivity Groups UI
    // ---------------------------------------------------------------

    function _renderExclusivityGroups(container) {
        container.innerHTML = '';

        // Only show if there are state-type behaviors
        var stateBehaviors = [];
        var behaviors = (_project && _project.ethogram && _project.ethogram.behaviors) || [];
        for (var i = 0; i < behaviors.length; i++) {
            if (behaviors[i].type === 'state') {
                stateBehaviors.push(behaviors[i]);
            }
        }

        if (stateBehaviors.length < 2) return; // Need at least 2 state behaviors

        var section = document.createElement('div');
        section.style.marginTop = '24px';
        section.style.padding = '16px';
        section.style.backgroundColor = '#f9f9f9';
        section.style.borderRadius = '8px';
        section.style.border = '1px solid #e0e0e0';

        var header = document.createElement('h4');
        header.textContent = 'Mutual Exclusivity Groups';
        header.style.margin = '0 0 6px';
        header.style.fontSize = '14px';
        header.style.fontWeight = '600';
        section.appendChild(header);

        var hint = document.createElement('p');
        hint.style.fontSize = '12px';
        hint.style.color = '#888';
        hint.style.margin = '0 0 12px';
        hint.textContent = 'Behaviors in the same group cannot be active simultaneously. Starting one will auto-stop others in the group.';
        section.appendChild(hint);

        var groups = _project.ethogram.mutualExclusivityGroups || [];

        for (var g = 0; g < groups.length; g++) {
            _appendGroupRow(section, groups[g], stateBehaviors, g);
        }

        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.textContent = '+ Add Exclusivity Group';
        addBtn.style.padding = '6px 14px';
        addBtn.style.fontSize = '12px';
        addBtn.style.cursor = 'pointer';
        addBtn.style.border = '1px solid #ccc';
        addBtn.style.borderRadius = '4px';
        addBtn.style.backgroundColor = '#f8f8f8';
        addBtn.style.marginTop = '8px';
        addBtn.addEventListener('click', function () {
            var newGroup = {
                id: EthoLogger.Utils.generateId('meg'),
                name: '',
                behaviorIds: []
            };
            _project.ethogram.mutualExclusivityGroups.push(newGroup);
            _autoSave();
            _render();
        });
        section.appendChild(addBtn);

        container.appendChild(section);
    }

    function _appendGroupRow(container, group, stateBehaviors, groupIndex) {
        var row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexWrap = 'wrap';
        row.style.gap = '8px';
        row.style.alignItems = 'flex-start';
        row.style.marginBottom = '10px';
        row.style.paddingBottom = '10px';
        row.style.borderBottom = '1px solid #e0e0e0';

        // Group name input
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Group name (e.g. Locomotor States)';
        nameInput.value = group.name || '';
        nameInput.style.flex = '0 0 200px';
        nameInput.style.padding = '6px 8px';
        nameInput.style.fontSize = '13px';
        nameInput.style.border = '1px solid #ccc';
        nameInput.style.borderRadius = '4px';
        (function (grp) {
            nameInput.addEventListener('change', function () {
                grp.name = nameInput.value.trim();
                _autoSave();
            });
        })(group);
        row.appendChild(nameInput);

        // Behavior checkboxes
        var checkboxArea = document.createElement('div');
        checkboxArea.style.flex = '1';
        checkboxArea.style.display = 'flex';
        checkboxArea.style.flexWrap = 'wrap';
        checkboxArea.style.gap = '6px';
        checkboxArea.style.alignItems = 'center';

        for (var i = 0; i < stateBehaviors.length; i++) {
            var beh = stateBehaviors[i];
            var label = document.createElement('label');
            label.style.display = 'inline-flex';
            label.style.alignItems = 'center';
            label.style.gap = '3px';
            label.style.fontSize = '12px';
            label.style.cursor = 'pointer';
            label.style.padding = '3px 8px';
            label.style.borderRadius = '4px';
            label.style.border = '1px solid #ddd';
            label.style.backgroundColor = '#fff';

            var swatch = document.createElement('span');
            swatch.style.display = 'inline-block';
            swatch.style.width = '10px';
            swatch.style.height = '10px';
            swatch.style.borderRadius = '2px';
            swatch.style.backgroundColor = beh.color || '#999';
            label.appendChild(swatch);

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = group.behaviorIds.indexOf(beh.id) !== -1;
            checkbox.style.margin = '0';
            (function (grp, behaviorId) {
                checkbox.addEventListener('change', function () {
                    var idx = grp.behaviorIds.indexOf(behaviorId);
                    if (this.checked && idx === -1) {
                        grp.behaviorIds.push(behaviorId);
                    } else if (!this.checked && idx !== -1) {
                        grp.behaviorIds.splice(idx, 1);
                    }
                    _autoSave();
                });
            })(group, beh.id);
            label.appendChild(checkbox);

            var nameSpan = document.createElement('span');
            nameSpan.textContent = beh.name;
            label.appendChild(nameSpan);

            checkboxArea.appendChild(label);
        }
        row.appendChild(checkboxArea);

        // Delete button
        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = '\u00D7';
        deleteBtn.style.padding = '4px 10px';
        deleteBtn.style.fontSize = '16px';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.border = '1px solid #e57373';
        deleteBtn.style.borderRadius = '4px';
        deleteBtn.style.backgroundColor = '#ffebee';
        deleteBtn.style.color = '#c62828';
        deleteBtn.style.lineHeight = '1';
        deleteBtn.style.flexShrink = '0';
        (function (idx) {
            deleteBtn.addEventListener('click', function () {
                _project.ethogram.mutualExclusivityGroups.splice(idx, 1);
                _autoSave();
                _render();
            });
        })(groupIndex);
        row.appendChild(deleteBtn);

        container.appendChild(row);
    }

    // ---------------------------------------------------------------
    // Event handlers
    // ---------------------------------------------------------------

    function _handleFormSubmit(formEl) {
        var name = formEl.querySelector('[name="behavior-name"]').value;
        var category = formEl.querySelector('[name="behavior-category"]').value;
        var type = formEl.querySelector('[name="behavior-type"]').value;
        var key = formEl.querySelector('[name="behavior-key"]').value;
        var color = formEl.querySelector('[name="behavior-color"]').value;

        var data = {
            name: name,
            category: category,
            type: type,
            key: key,
            color: color,
            modifiers: _parseModifiers(formEl)
        };

        var result;
        if (_editingBehaviorId) {
            result = updateBehavior(_editingBehaviorId, data);
        } else {
            result = createBehavior(data);
        }

        if (result.ok) {
            _editingBehaviorId = null;
            _render();
            EthoLogger.Utils.showToast(
                _editingBehaviorId ? 'Behavior updated.' : 'Behavior added.',
                1500
            );
        } else {
            EthoLogger.Utils.showToast(result.error || 'Validation failed.', 2500);
        }
    }

    function _handleEditClick(e) {
        var id = e.currentTarget.getAttribute('data-behavior-id');
        _editingBehaviorId = id;
        _render();

        // Scroll the form into view
        if (_containerEl) {
            var formEl = _containerEl.querySelector('.ethogram-form');
            if (formEl) {
                formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    function _handleDeleteClick(e) {
        var id = e.currentTarget.getAttribute('data-behavior-id');
        var behavior = _findBehavior(id);
        var label = behavior ? behavior.name : 'this behavior';

        if (confirm('Delete "' + label + '"? This cannot be undone.')) {
            removeBehavior(id);
            EthoLogger.Utils.showToast('Behavior deleted.', 1500);
        }
    }

    // ---------------------------------------------------------------
    // Init
    // ---------------------------------------------------------------

    /**
     * Initialize the ethogram builder UI.
     * @param {HTMLElement} containerEl - DOM element to render the builder into.
     */
    function init(containerEl) {
        _containerEl = containerEl;

        // Receive the current project from EthoLogger.App
        if (EthoLogger.App && EthoLogger.App.getCurrentProject) {
            _project = EthoLogger.App.getCurrentProject();
        }

        // Ensure the project has an ethogram object
        if (_project && !_project.ethogram) {
            _project.ethogram = {
                id: EthoLogger.Utils.generateId('eth'),
                name: 'Untitled Ethogram',
                description: '',
                createdAt: new Date().toISOString(),
                modifiedAt: new Date().toISOString(),
                behaviors: [],
                mutualExclusivityGroups: []
            };
        }

        // Migration: ensure mutualExclusivityGroups exists
        if (_project && _project.ethogram && !_project.ethogram.mutualExclusivityGroups) {
            _project.ethogram.mutualExclusivityGroups = [];
        }

        _editingBehaviorId = null;
        _render();
    }

    // ---------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------

    EthoLogger.Ethogram = {
        init: init,
        createBehavior: createBehavior,
        updateBehavior: updateBehavior,
        removeBehavior: removeBehavior,
        validateKey: validateKey,
        getKeyMap: getKeyMap,
        renderBehaviorList: renderBehaviorList,
        renderBehaviorForm: renderBehaviorForm,
        getDefaultColors: getDefaultColors,
        getNextColor: getNextColor
    };
})();
