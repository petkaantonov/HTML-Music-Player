var glob = require("glob");
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require("fs"));
var UglifyJS = require("uglify-js");
var crypto = require("crypto");

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
    "js/ServiceWorkerManager.js",
    "js/Snackbar.js",
    "js/Animator.js",
    "js/Popup.js",
    "js/KeyValueDatabase.js",
    "js/Tooltip.js",
    "js/GlobalUi.js",
    "js/PlayerTimeManager.js",
    "js/PlayerVolumeManager.js",
    "js/PlayerPictureManager.js",
    "js/PlaylistModeManager.js",
    "js/PlaylistNotifications.js",
    "js/AcoustIdApiError.js",
    "js/AudioVisualizer.js",
    "js/features.js",
    "js/TrackWasRemovedError.js",
    "js/AudioError.js",
    "js/FileError.js",
    "js/Track.js",
    "js/Playlist.js",
    "js/Selectable.js",
    "js/DraggableSelection.js",
    "js/TrackDisplay.js",
    "js/ActionMenu.js",
    "js/TrackSearcher.js",
    "js/LocalFiles.js",
    "js/Slider.js",
    "js/WorkerPool.js",
    "js/TrackAnalyzer.js",
    "js/LoudnessCalculator.js",
    "js/FingerprintCalculator.js",
    "js/TagDatabase.js",
    "js/TagData.js",
    "js/Id3Process.js",
    "js/Player.js",
    "js/jquery.fileinput.js",
    "js/MetadataRetriever.js",
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

var rinline = /"(https:\/\/[^"]+)"/g;
var inlineAssets = fs.readFileSync("./dev.html", "utf8").match(rinline).map(function(v) {
    return v.replace(/(?:^"|"$)/g, "");
}).concat("index.html", "/");

var assets = glob.sync("dist/css/**/*.*")
                .concat(glob.sync("dist/images/**/*.*"))
                .concat(glob.sync("dist/fonts/**/*.woff*"))
                .concat(glob.sync("worker/**/*.*"));

var serviceWorkerAssetsList = assets.concat("dist/main.min.js", inlineAssets).sort();

var hash = crypto.createHash('sha256');
var version = Promise.map(assets.concat(scripts), function(file) {
    return fs.readFileAsync(file);
}, {concurrency: 4}).then(function(contents) {
    contents.forEach(function(content) {
        hash.update(content);
    });
    // Any removal or addition to the asset list triggers change.
    hash.update(JSON.stringify(serviceWorkerAssetsList));
}).then(function() {
    return hash.digest("hex");
})

var serviceWorkerBase = fs.readFileAsync("sw_base.js", "utf8");

var serviceWorkerCreated = Promise.join(serviceWorkerBase, version, function(serviceWorkerBaseCode, version) {
    var assetsCode = "const assets = " + JSON.stringify(serviceWorkerAssetsList, null, 4) + ";\n";
    var hashCode = "const versionHash = '" + version + "';\n";
    var buildDate = "const buildDate = '" + new Date().toUTCString()+ "';\n";
    serviceWorkerBaseCode = "// AUTOMATICALLY GENERATED FILE DO NOT EDIT\n" + assetsCode + hashCode + buildDate + serviceWorkerBaseCode;
    return fs.writeFileAsync("sw.js", serviceWorkerBaseCode, "utf8");
});


var scriptsMinified = Promise.map(scripts, function(script) {
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
}).all();

Promise.join(serviceWorkerCreated, scriptsMinified, function() {
    console.log("done");
});
