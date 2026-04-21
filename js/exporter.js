/**
 * EthoLogger Exporter Module
 * Handles CSV export of annotation data via Papa Parse.
 * Depends on EthoLogger.Utils (utils.js) and Papa Parse (vendor/papaparse.min.js).
 */
(function () {
    'use strict';

    window.EthoLogger = window.EthoLogger || {};

    /**
     * Export a project's annotations as a CSV file download.
     * Transforms annotations into flat rows with behavior metadata,
     * sorts by onset time, generates CSV via Papa Parse, and triggers download.
     *
     * @param {Object} project - The project object containing ethogram and annotations.
     */
    function exportCSV(project) {
        if (!project || !project.annotations || project.annotations.length === 0) {
            EthoLogger.Utils.showToast('No annotations to export');
            return;
        }

        // Build a lookup map from behavior ID to behavior object
        var behaviorMap = {};
        var behaviors = (project.ethogram && project.ethogram.behaviors) || [];
        for (var i = 0; i < behaviors.length; i++) {
            behaviorMap[behaviors[i].id] = behaviors[i];
        }

        // Build a lookup map from subject ID to subject object
        var subjectMap = {};
        var subjects = project.subjects || [];
        for (var si = 0; si < subjects.length; si++) {
            subjectMap[subjects[si].id] = subjects[si];
        }

        // Collect all unique modifier set names across all behaviors (for column headers)
        var modifierSetNames = [];
        var modSetNamesSeen = {};
        for (var mi = 0; mi < behaviors.length; mi++) {
            var bMods = behaviors[mi].modifiers || [];
            for (var mj = 0; mj < bMods.length; mj++) {
                if (!modSetNamesSeen[bMods[mj].name]) {
                    modSetNamesSeen[bMods[mj].name] = true;
                    modifierSetNames.push(bMods[mj].name);
                }
            }
        }

        // Transform annotations into flat row objects
        var rows = [];
        for (var j = 0; j < project.annotations.length; j++) {
            var ann = project.annotations[j];
            var behavior = behaviorMap[ann.behaviorId] || {
                name: 'Unknown',
                category: '',
                type: '',
                modifiers: []
            };

            var subject = ann.subjectId ? (subjectMap[ann.subjectId] || { name: '' }) : { name: '' };

            var row = {
                onset_sec: ann.onset.toFixed(3),
                offset_sec: ann.offset !== null ? ann.offset.toFixed(3) : '',
                duration_sec: ann.offset !== null ? (ann.offset - ann.onset).toFixed(3) : '0.000',
                onset_time: EthoLogger.Utils.formatTime(ann.onset),
                offset_time: ann.offset !== null ? EthoLogger.Utils.formatTime(ann.offset) : '',
                behavior: behavior.name,
                category: behavior.category,
                type: behavior.type,
                subject: subject.name
            };

            // Add modifier columns
            for (var mk = 0; mk < modifierSetNames.length; mk++) {
                var setName = modifierSetNames[mk];
                var colKey = 'modifier_' + setName.toLowerCase().replace(/\s+/g, '_');
                var value = '';
                var behMods = behavior.modifiers || [];
                for (var ml = 0; ml < behMods.length; ml++) {
                    if (behMods[ml].name === setName && ann.modifiers && ann.modifiers[behMods[ml].id]) {
                        value = ann.modifiers[behMods[ml].id];
                    }
                }
                row[colKey] = value;
            }

            row.coder_id = project.coderId;
            row.video_file = project.videoFileName || '';

            rows.push(row);
        }

        // Sort rows by onset_sec ascending (compare as floats)
        rows.sort(function (a, b) {
            return parseFloat(a.onset_sec) - parseFloat(b.onset_sec);
        });

        // Generate CSV string via Papa Parse
        var csv = Papa.unparse(rows);

        // Trigger file download
        var filename = project.name + '_annotations.csv';
        EthoLogger.Utils.downloadFile(csv, filename, 'text/csv');

        EthoLogger.Utils.showToast('CSV exported: ' + filename);
    }

    // Expose on the shared namespace
    EthoLogger.Exporter = {
        exportCSV: exportCSV
    };
})();
