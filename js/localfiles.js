var workerPool = new WorkerPool((navigator.hardwareConcurrency || 2) - 1, "worker/root.js");
var replayGainProcessor = new ReplayGainProcessor(workerPool);
var localFiles = new LocalFiles(playlist.main, features.allowMimes, features.allowExtensions);
new ID3Process(playlist.main, replayGainProcessor);

$(document)
    .bind('dragenter', function(ev) {
        return false;
    })
    .bind("dragleave", function(ev) {
        return false;
    })
    .bind("dragover", function(ev) {
        return false;
    })
    .bind("drop", function(ev) {
        localFiles.handle(ev.originalEvent.dataTransfer.files);
        ev.preventDefault();
        ev.stopPropagation();
        return false;
    })
    .bind("selectstart", function(e) {
        var insideInput = !!(/textarea|input|select/i.test(e.target.nodeName) || e.target.isContentEditable);
        if (!insideInput) {
            e.preventDefault();
        }
    });

