var Path = require("path");
process.env.NODE_PATH = Path.join(process.cwd(), "src");
var execOpts = {};
var glob = require("glob");
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require("fs"));
var UglifyJS = require("uglify-js");
var crypto = require("crypto");

var Promise = require("bluebird");
Promise.longStackTraces();
var cp = require("child_process");
Promise.promisifyAll(cp);

var criticalCssResolve;
var criticalCss = new Promise(function(resolve) {
    criticalCssResolve = resolve;
});
var css = cp.execAsync("rm -rf dist/css/min", execOpts).reflect().then(function() {
    return cp.execAsync("mkdir -p dist/css/min", execOpts);
}).then(function() {
    return cp.execAsync("node_modules/.bin/node-sass sass/ --output-style=\"compressed\" --recursive sass/app-css-public.scss -o dist/css/min/", execOpts);
}).then(function() {
    return cp.execAsync("mv dist/css/min/app-css-public.css dist/css/app-css-public.min.css", execOpts);
}).then(function() {
    return fs.readFileAsync("dist/css/min/critical.css", "utf8");
}).then(function(criticalCss) {
    return cp.execAsync("rm -rf dist/css/min", execOpts).return(criticalCss);
}).then(function(criticalCss) {
    criticalCss = criticalCss.replace(/\.\.\/(.+?)\//g, "dist/$1/");
    criticalCss = '<style type="text/css">' + criticalCss + '</style>';
    return fs.readFileAsync("index_base.html", "utf8").then(function(contents) {
        contents = contents.replace("$critical_css", criticalCss);
        return fs.writeFileAsync("index.html", contents, "utf8");
    });
});

var workerDirCreated = cp.execAsync("mkdir -p dist/worker/codecs", execOpts);

var browserified = workerDirCreated.then(function() {
    var codecs = Promise.map(glob.sync("src/codecs/**/*.js"), function(codecPath) {
        var name = Path.basename(codecPath, ".js");
        var newDest = Path.join("dist/worker/codecs", name + ".js");
        var minDest = Path.join("dist/worker/codecs", name + ".min.js");
        return fs.readFileAsync(codecPath, "utf8").then(function(contents) {
            var minified = UglifyJS.minify(contents, {
                fromString: true
            });
            return Promise.all([fs.writeFileAsync(newDest, contents, "utf8"),
                                fs.writeFileAsync(minDest, minified.code, "utf8")]);
        });
    }, {concurrency: 4});

    return Promise.all(
        [codecs, css, cp.execAsync("browserify src/audio/AudioPlayerBackend.js --standalone AudioPlayer > dist/worker/AudioPlayerWorker.js", execOpts).then(function() {
            return fs.readFileAsync("dist/worker/AudioPlayerWorker.js", "utf8");
        }).then(function(contents) {
            contents = "self.DEBUGGING = false;\n" + contents;
            var minified = UglifyJS.minify(contents, {
                fromString: true
            });
            return fs.writeFileAsync("dist/worker/AudioPlayerWorker.min.js", minified.code, "utf8");
        }),
        cp.execAsync("browserify src/audio/TrackAnalyzerBackend.js --standalone TrackAnalyzer > dist/worker/TrackAnalyzerWorker.js", execOpts).then(function() {
            return fs.readFileAsync("dist/worker/TrackAnalyzerWorker.js", "utf8");
        }).then(function(contents) {
            contents = "self.DEBUGGING = false;\n" + contents;
            var minified = UglifyJS.minify(contents, {
                fromString: true
            });
            return fs.writeFileAsync("dist/worker/TrackAnalyzerWorker.min.js", minified.code, "utf8");
        }),
        cp.execAsync("browserify src/application.js --standalone Application > dist/main.js", execOpts)
    ]);
});

var assetsGenerated = browserified.then(function() {
    var assets = ["dist/css/app-css-public.min.css"]
                    .concat(glob.sync("dist/images/**/*.*"))
                    .concat(glob.sync("dist/fonts/**/*.woff*"))
                    .concat(glob.sync("dist/worker/codecs/**/*.min.js"))
                    .concat("dist/worker/AudioPlayerWorker.min.js", "dist/worker/TrackAnalyzerWorker.min.js");

    var serviceWorkerAssetsList = assets.concat("dist/main.min.js", "index.html", "/").sort();
    var serviceWorkerBase = fs.readFileAsync("sw_base.js", "utf8");

    var serviceWorkerCreated = serviceWorkerBase.then(function(serviceWorkerBaseCode) {
        var assetsCode = "const assets = " + JSON.stringify(serviceWorkerAssetsList, null, 4) + ";\n";
        var buildDate = "const buildDate = '" + new Date().toUTCString()+ "';\n";
        serviceWorkerBaseCode = assetsCode + buildDate + serviceWorkerBaseCode;
        var minified = UglifyJS.minify(serviceWorkerBaseCode, {
            fromString: true
        });

        serviceWorkerBaseCode = "// AUTOMATICALLY GENERATED FILE DO NOT EDIT\n" + minified.code;
        return fs.writeFileAsync("sw.js", serviceWorkerBaseCode, "utf8");
    });

    return serviceWorkerCreated.then(function() {
        var dir = process.cwd();
        process.chdir("dist");
        delete process.env.NODE_PATH;
        var minified = UglifyJS.minify("main.js", {
            outSourceMap: "main.js.map"
        });
        process.chdir(dir);
        var codeWritten = fs.writeFileAsync("dist/main.min.js", minified.code, "utf8");
        minified.map = minified.map.replace('"file":"main.js.map"', '"file":"main.min.js"');
        var mapWritten = fs.writeFileAsync("dist/main.js.map", minified.map, "utf8");
        return [codeWritten, mapWritten];
    });
});

Promise.join(assetsGenerated, function() {
    console.log("done");
});
