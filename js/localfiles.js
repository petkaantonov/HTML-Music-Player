var workerPool = new WorkerPool((navigator.hardwareConcurrency || 2) - 1, "worker/root.js");
var replayGainProcessor = new ReplayGainProcessor(workerPool);
var localFiles = new LocalFiles(playlist.main, features.allowMimes, features.allowExtensions);
new ID3Process(playlist.main, replayGainProcessor);

const rInput = /textarea|input|select/i;
const rTextInput = /^(?:text|search|tel|url|email|password|number)$/i;

$(document)
    .on('dragenter', function(ev) {
        return false;
    })
    .on("dragleave", function(ev) {
        return false;
    })
    .on("dragover", function(ev) {
        return false;
    })
    .on("drop", function(ev) {
        localFiles.handle(ev.originalEvent.dataTransfer.files);
        ev.preventDefault();
        ev.stopPropagation();
        return false;
    })
    .on("selectstart", function(e) {
        if (rInput.test(e.target.nodeName)) {
            if (!(e.target.nodeName.toLowerCase() !== "input" ||
                rTextInput.test(e.target.type))) {
                e.preventDefault();
            }
        } else if (!e.target.isContentEditable) {
            e.preventDefault();
        }
    });

