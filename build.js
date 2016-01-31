var glob = require("glob");
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require("fs"));
var UglifyJS = require("uglify-js");
var crypto = require("crypto");

var Promise = require("bluebird");
Promise.longStackTraces();
var cp = require("child_process");
Promise.promisifyAll(cp);
var browserified = Promise.all(
    [cp.execAsync("browserify worker/AudioPlayer.js --standalone AudioPlayer > worker/AudioPlayerWorker.js"),
    cp.execAsync("browserify worker/TrackAnalyzer.js --standalone TrackAnalyzer > worker/TrackAnalyzerWorker.js"),
    cp.execAsync("browserify js/application.js --standalone Application > dist/main.js"),
    cp.execAsync("rm -rf dist/css/min").reflect().then(function() {
        return cp.execAsync("mkdir -p dist/css/min");
    }).then(function() {
        return cp.execAsync("node_modules/.bin/node-sass sass/ --output-style=\"compressed\" --recursive sass/app-css-public.scss -o dist/css/min/");
    }).then(function() {
        return cp.execAsync("mv dist/css/min/app-css-public.css dist/css/app-css-public.min.css");
    }).then(function() {
        return cp.execAsync("rm -rf dist/css/min");
    })]);


var assetsGenerated = browserified.then(function() {
    var assets = ["dist/css/app-css-public.min.css"]
                    .concat(glob.sync("dist/images/**/*.*"))
                    .concat(glob.sync("dist/fonts/**/*.woff*"))
                    .concat(glob.sync("worker/codecs/**/*.*"))
                    .concat("worker/AudioPlayerWorker.js", "worker/TrackAnalyzerWorker.js");

    var serviceWorkerAssetsList = assets.concat("dist/main.min.js", "index.html", "/").sort();

    var hash = crypto.createHash('sha256');
    var filesToRead = assets.concat("dist/main.js", "index.html");
    console.error("files to read");
    console.error(filesToRead.join("\n"));
    var version = Promise.map(filesToRead, function(file) {
        console.error("reading file", file);
        return fs.readFileAsync(file).catch(function(e) {
            console.error("could not read file", file);
            console.error(e.name, e.message);
            return "";
        });
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
        serviceWorkerBaseCode = assetsCode + hashCode + buildDate + serviceWorkerBaseCode;
        var minified = UglifyJS.minify(serviceWorkerBaseCode, {
            fromString: true
        });

        serviceWorkerBaseCode = "// AUTOMATICALLY GENERATED FILE DO NOT EDIT\n" + minified.code;
        return fs.writeFileAsync("sw.js", serviceWorkerBaseCode, "utf8");
    });

    return serviceWorkerCreated.then(function() {
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
    });
}).all();

Promise.join(assetsGenerated, function() {
    console.log("done");
});
