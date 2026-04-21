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

        // Transform annotations into flat row objects
        var rows = [];
        for (var j = 0; j < project.annotations.length; j++) {
            var ann = project.annotations[j];
            var behavior = behaviorMap[ann.behaviorId] || {
                name: 'Unknown',
                category: '',
                type: ''
            };

            var row = {
                onset_sec: ann.onset.toFixed(3),
                offset_sec: ann.offset !== null ? ann.offset.toFixed(3) : '',
                duration_sec: ann.offset !== null ? (ann.offset - ann.onset).toFixed(3) : '0.000',
                onset_time: EthoLogger.Utils.formatTime(ann.onset),
                offset_time: ann.offset !== null ? EthoLogger.Utils.formatTime(ann.offset) : '',
                behavior: behavior.name,
                category: behavior.category,
                type: behavior.type,
                coder_id: project.coderId,
                video_file: project.videoFileName || ''
            };

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
