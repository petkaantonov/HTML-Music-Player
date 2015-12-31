var Promise = require("bluebird");
var cp = require("child_process");
Promise.promisifyAll(cp);
var browserified = Promise.all(
    [cp.execAsync("browserify worker/AudioPlayer.js --standalone AudioPlayer > worker/AudioPlayerWorker.js"),
    cp.execAsync("browserify js/application.js --standalone Application > dist/main.js")]);

var glob = require("glob");
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require("fs"));
var UglifyJS = require("uglify-js");
var crypto = require("crypto");
var allFiles = glob.sync("lib/**/*.*").concat(glob.sync("js/**/*.*"));
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
var version = Promise.map(assets.concat("dist/main.js"), function(file) {
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

var scriptsMinified = browserified.then(function() {
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
