var gulp = require('gulp');
var del = require('del');
var mkdirp = require("mkdirp").sync;
var glob = require("glob").sync;
var source = require('vinyl-source-stream');
var rollup = require('rollup-stream');
var actualRollup = require("rollup");
var minify = require("uglify-es").minify;
var uglify = require('rollup-plugin-uglify');
var sourcemaps = require('gulp-sourcemaps');
var replace = require('gulp-replace');
var path = require('path');
var buffer = require('vinyl-buffer');
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require('fs'));
var includePaths = require("rollup-plugin-includepaths");
var commonjs = require("rollup-plugin-commonjs");
var nodeResolve = require("rollup-plugin-node-resolve");
var asyncPlugin = require("rollup-plugin-async");
var rename = require("gulp-rename");
var sass = require('gulp-sass');
var jshint = require("gulp-jshint");
var pump = Promise.promisify(require("pump"));
var composer = require("gulp-uglify/composer")
var gulpMinify = composer(require("uglify-es"), console);

var licenseHeader = fs.readFileSync("./LICENSE_header", "utf8");
var RELEASE = 1 << 0;
var DEBUG = 1 << 1;


function bundleJs(opts) {
    opts = Object(opts);
    var entry = opts.entry;
    var format = opts.format;
    var banner = opts.banner || "";
    var moduleName = opts.moduleName;

    var plugins = [asyncPlugin(), includePaths({
        include: {},
        paths: ['src', 'vendor'],
        external: [],
        extensions: ['.js']
    }), nodeResolve({
        jsnext: true,
        main: true
    }), commonjs({
        include: ['node_modules/**']
    })];

    var args = {
        entry: entry,
        sourceMap: false,
        banner: banner,
        plugins: plugins,
        format: format,
        moduleName: moduleName,
        rollup: actualRollup
    };

    var full = null;
    var minified = null;

    if (opts.target & DEBUG) {
        full = rollup(args);
    }
    if (opts.target & RELEASE) {
        args.sourceMap = true;
        plugins.push(uglify({
            output: { comments: /@preserve/ }
        }, minify));
        minified = rollup(args);
    }

    return {
        full: full,
        minified: minified
    };
}

function bundleGui(target) {
    var bundles = bundleJs({
        entry: "src/bootstrap.js",
        moduleName: "bootstrap",
        format: "iife",
        banner: licenseHeader,
        target: target
    });

    var full, minified;
    if (target & DEBUG) {
        full = pump([bundles.full, source("main.js"), buffer(), gulp.dest("dist")]);
    }

    if (target & RELEASE) {
        minified = pump([bundles.minified,
                         source("main.min.js"),
                         buffer(),
                         sourcemaps.init({loadMaps: true}),
                         sourcemaps.write("."),
                         gulp.dest("dist")]);
    }
    return Promise.all([full, minified]);
}

function bundleCodecs(target) {
    mkdirp("dist/worker/codecs");
    var codecs = glob("src/codecs/**/*.js");

    return Promise.map(codecs, function(codecPath) {
        var name = path.basename(codecPath, ".js");


        var bundles = bundleJs({
            entry: codecPath,
            moduleName: name,
            format: "iife",
            /*banner: todo*/
            target: target
        });

        var full, minified;

        if (target & DEBUG) {
            full = pump([bundles.full, source(name + ".js"), buffer(), gulp.dest("dist/worker/codecs")])
        }

        if (target & RELEASE) {
            minified = pump([bundles.minified,
                source(name + ".min.js"),
                buffer(),
                sourcemaps.init({loadMaps: true}),
                sourcemaps.write("."),
                gulp.dest("dist/worker/codecs")])
        }

        return Promise.all([minified, full]);
    }, {concurrency: 4});
}

function bundleWorker(entry, name, target) {
    mkdirp("dist/worker");

    var bundles = bundleJs({
        entry: entry,
        moduleName: name,
        format: "iife",
        banner: licenseHeader,
        target: target
    });

    var full, minified;

    if (target & DEBUG) {
        full = pump([bundles.full, source(name + ".js"), buffer(), replace(/^/, "self.DEBUGGING = true;\n"), gulp.dest("dist/worker")]);
    }

    if (target & RELEASE) {
        minified = pump([bundles.minified, source(name + ".min.js"),
            buffer(),
            sourcemaps.init({loadMaps: true}),
            replace(/^/, "self.DEBUGGING = false;\n"),
            sourcemaps.write("."),
            gulp.dest("dist/worker")]);
    }
    return Promise.all([full, minified]);
}

function bundleTrackAnalyzerBackend(min) {
    return bundleWorker("src/tracks/TrackAnalyzerBackend.js", "TrackAnalyzerBackend", min);
}

function bundleAudioPlayerBackend(min) {
    return bundleWorker("src/audio/AudioPlayerBackend.js", "AudioPlayerBackend", min);
}

function bundleServiceWorker() {
    var codecPaths = glob("src/codecs/**/*.js").map(function(sourcePath) {
        var name = path.basename(sourcePath, ".js");
        return "dist/worker/codecs/" + name + ".min.js";
    });

    var assets = ["dist/css/app-css-public.min.css"]
                    .concat(glob("dist/images/**/*.*"))
                    .concat(glob("dist/fonts/**/*.woff*"))
                    .concat(codecPaths)
                    .concat("dist/worker/AudioPlayerBackend.min.js", "dist/worker/TrackAnalyzerBackend.min.js");

    var serviceWorkerAssetsList = assets.concat("dist/main.min.js", "index.html", "/").sort();
    var assetsCode = "const assets = " + JSON.stringify(serviceWorkerAssetsList, null, 4) + ";\n";
    var buildDate = "const buildDate = '" + new Date().toUTCString()+ "';\n";
    var code = "// AUTOMATICALLY GENERATED FILE DO NOT EDIT\n" + licenseHeader + assetsCode +  buildDate;

    return pump([gulp.src("sw_base.js"),
                rename("sw.js"),
                buffer(),
                replace(/^/, code),
                sourcemaps.init({loadMaps: true}),
                gulpMinify({}),
                sourcemaps.write("."),
                gulp.dest(".")]);
}

function bundleSass() {
    mkdirp("dist/css");
    return pump([gulp.src("sass/**/*.scss"),
                    sourcemaps.init({loadMaps: true}),
                    sass({outputStyle: "compressed", recursive: true}),
                    sourcemaps.write("."),
                    gulp.dest("dist/css")]).then(function() {
            var criticalCss = fs.readFileSync("dist/css/critical.css", "utf8").replace(/\.\.\/(.+?)\//g, "dist/$1/");
            criticalCss = '<style type="text/css">' + criticalCss + '</style>';
            return pump([gulp.src("index_base.html"),
                    replace("$critical_css", criticalCss),
                    rename("index.html"),
                    gulp.dest(".")]);
        });

}

function build() {
    return Promise.all([
        bundleSass(),
        bundleGui(RELEASE),
        bundleAudioPlayerBackend(RELEASE),
        bundleTrackAnalyzerBackend(RELEASE),
        bundleCodecs(RELEASE),
        bundleServiceWorker()
    ]);
}

function buildDebug() {
    return Promise.all([
        bundleSass(),
        bundleGui(DEBUG),
        bundleAudioPlayerBackend(DEBUG),
        bundleTrackAnalyzerBackend(DEBUG),
        bundleCodecs(DEBUG),
        bundleServiceWorker()
    ]);
}

function reportError(e) {
    this.push((e && e.message ? e.message : new Error(e)) + "\n");
    console.error(e.stack);
    this.emit("end");
}


function runWatchSass() {
    return pump([gulp.src("sass/**/*.scss"),
                sass({recursive: true}),
                gulp.dest("dist/css")]);
}



gulp.task("lint", function() {
    return Promise.resolve(); //awaitStream(gulp.src("src/**/*.js").pipe(jshint(".jshintrc")).pipe(jshint.reporter("jshint-stylish", {verbose: true})));
});

gulp.task("gui", bundleGui.bind(null, DEBUG));
gulp.task("nongui", function() {
    return Promise.all([
        bundleAudioPlayerBackend(DEBUG),
        bundleTrackAnalyzerBackend(DEBUG),
        bundleCodecs(DEBUG)
    ]);
})

gulp.task("runwatch:sass", runWatchSass);
gulp.task('watch:css', function () {
  mkdirp("dist/css");
  runWatchSass().then(function() {
    gulp.watch('sass/**/*.scss', ['runwatch:sass']);
  });
});

gulp.task("watch:gui", function() {
    gulp.watch("src/**/*.js", ["gui"]);
});

gulp.task("watch:nongui", function() {

    gulp.watch("src/**/*.js", ["nongui"]);
});

gulp.task("build", ["lint"], build);
gulp.task("build-debug", ["lint"], buildDebug);
gulp.task("build-nolint", build);

gulp.on("err", function(e) {
    console.log(e);
})
