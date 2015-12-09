var glob = require("glob");
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require("fs"));
var UglifyJS = require("uglify-js");

var scripts = [
    "lib/sha1.js",
    "lib/DataStructures.js",
    "lib/events.js",
    "lib/jquery.js",
    "lib/perfect-scrollbar.jquery.min.js",
    "lib/bluebird.js",
    "js/BluebirdConfig.js",
    "lib/hotkeys.js",
    "lib/realfft.js",
    "lib/bezier.js",
    "js/Random.js",
    "js/util.js",
    "js/KeyValueDatabase.js",
    "js/Tooltip.js",
    "js/PanelControls.js",
    "js/PlayerTimeManager.js",
    "js/PlayerVolumeManager.js",
    "js/PlayerPictureManager.js",
    "js/PlaylistModeManager.js",
    "js/PlaylistNotifications.js",
    "js/AudioVisualizer.js",
    "js/features.js",
    "js/TrackWasRemovedError.js",
    "js/FileError.js",
    "js/AudioError.js",
    "js/Track.js",
    "js/Playlist.js",
    "js/Selectable.js",
    "js/DraggableSelection.js",
    "js/TrackDisplay.js",
    "js/ActionMenu.js",
    "js/Popup.js",
    "js/BlockingPopup.js",
    "js/TrackSearcher.js",
    "js/LocalFiles.js",
    "js/Slider.js",
    "js/WorkerPool.js",
    "js/ReplayGainProcessor.js",
    "js/TagDatabase.js",
    "js/TagData.js",
    "js/Id3Process.js",
    "js/Player.js",
    "js/jquery.fileinput.js",
    "js/hotkeys.js",
    "js/equalizer.js",
    "js/playlist.js",
    "js/crossfading.js",
    "js/player.js",
    "js/filter.js",
    "js/localfiles.js",
    "js/visualizer.js",
    "js/application.js"
];

var allFiles = glob.sync("lib/**/*.*").concat(glob.sync("js/**/*.*"));

allFiles.forEach(function(file) {
    if (scripts.indexOf(file) < 0) {
        throw new Error("file " + file + " not in list");
    }
});



Promise.map(scripts, function(script) {
    return fs.readFileAsync(script, "utf8");
}).reduce(function(a, b) {
    return a + "\n;\n;\n" + b;
}, "").then(function(code) {
    return fs.writeFileAsync("dist/main.js", code, "utf8");
}).then(function() {
    var dir = process.cwd();
    process.chdir("dist");
    var minified = UglifyJS.minify("main.js", {
        outSourceMap: "main.js.map"
    });
    process.chdir(dir);
    var codeWritten = fs.writeFileAsync("dist/main.min.js", minified.code, "utf8");
    minified.map = minified.map.replace('"file":"main.js.map"', '"file":"main.min.js"');
    var mapWritten = fs.writeFileAsync("dist/main.js.map", minified.map, "utf8");
    return [codeWritten, mapWritten];
}).all().then(function() {
    console.log("done");
});
