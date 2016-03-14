var gulp = require('gulp');
var del = require('del');
var mkdirp = require("mkdirp").sync;
var glob = require("glob").sync;
var source = require('vinyl-source-stream');
var rollup = require('rollup-stream');
var uglify = require('rollup-plugin-uglify');
var sourcemaps = require('gulp-sourcemaps');
var replace = require('gulp-replace');
var path = require('path');
var buffer = require('vinyl-buffer');
var fs = require('fs');
var Promise = require("bluebird");
var includePaths = require("rollup-plugin-includepaths");
var commonjs = require("rollup-plugin-commonjs");
var nodeResolve = require("rollup-plugin-node-resolve");
var gulpUglify = require("gulp-uglify");
var rename = require("gulp-rename");
var sass = require('gulp-sass');
var jshint = require("gulp-jshint");

var licenseHeader = fs.readFileSync("./LICENSE_header", "utf8");

function bundleJs(opts) {
    opts = Object(opts);
    var entry = opts.entry;
    var format = opts.format;
    var banner = opts.banner || "";
    var moduleName = opts.moduleName;

    var plugins = [includePaths({
        include: {},
        paths: ['src'],
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
        sourceMap: true,
        banner: banner,
        plugins: plugins,
        format: format,
        moduleName: moduleName,
    };

    var full = rollup(args);
    var minified = null;
    if (opts.min) {
        plugins.push(uglify({
            output: { comments: /@preserve/ }
        }));
        minified = rollup(args);
    }

    return {
        full: full,
        minified: minified
    };
}

function bundleGui(min) {
    var bundles = bundleJs({
        entry: "src/bootstrap.js",
        moduleName: "bootstrap",
        format: "iife",
        banner: licenseHeader,
        min: !!min
    });

    var full = bundles.full.pipe(source("main.js"))
                .pipe(buffer())
                .pipe(sourcemaps.init({loadMaps: true}))
                .pipe(sourcemaps.write("."))
                .pipe(gulp.dest("dist"));
    var minified = null;

    if (min) {
        minified = bundles.minified.pipe(source("main.min.js"))
                    .pipe(buffer())
                    .pipe(sourcemaps.init({loadMaps: true}))
                    .pipe(sourcemaps.write("."))
                    .pipe(gulp.dest("dist"));
    }
    return Promise.all([full, minified]);
}

function bundleCodecs(min) {
    mkdirp("dist/worker/codecs");
    var codecs = glob("src/codecs/**/*.js");

    return Promise.map(codecs, function(codecPath) {
        var name = path.basename(codecPath, ".js");
        var bundles = bundleJs({
            entry: codecPath,
            moduleName: name,
            format: "iife",
            /*banner: todo*/
            min: !!min
        });

        var full = bundles.full.pipe(source(name + ".js"))
                            .pipe(buffer())
                            .pipe(sourcemaps.init({loadMaps: true}))
                            .pipe(sourcemaps.write("."))
                            .pipe(gulp.dest("dist/worker/codecs"));
        var minified = null;
        if (min) {
            minified = bundles.minified.pipe(source(name + ".min.js"))
                            .pipe(buffer())
                            .pipe(sourcemaps.init({loadMaps: true}))
                            .pipe(sourcemaps.write("."))
                            .pipe(gulp.dest("dist/worker/codecs"));
        }

        return Promise.all([minified, full]);
    }, {concurrency: 4});
}

function bundleWorker(entry, name, min) {
    mkdirp("dist/worker");

    var bundles = bundleJs({
        entry: entry,
        moduleName: name,
        format: "iife",
        banner: licenseHeader,
        min: !!min
    });

    var full = bundles.full.pipe(source(name + ".js"))
                .pipe(buffer())
                .pipe(sourcemaps.init({loadMaps: true}))
                .pipe(replace(/^/, "self.DEBUGGING = true;\n"))
                .pipe(sourcemaps.write("."))
                .pipe(gulp.dest("dist/worker"));
    var minified = null;
    if (min) {
        minified = bundles.minified.pipe(source(name + ".min.js"))
                    .pipe(buffer())
                    .pipe(sourcemaps.init({loadMaps: true}))
                    .pipe(replace(/^/, "self.DEBUGGING = false;\n"))
                    .pipe(sourcemaps.write("."))
                    .pipe(gulp.dest("dist/worker"));
    }
    return Promise.all([full, minified]);
}

function bundleTrackAnalyzerBackend(min) {
    return bundleWorker("src/audio/TrackAnalyzerBackend.js", "TrackAnalyzerBackend", min);
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
                    .concat("dist/worker/AudioPlayerWorker.min.js", "dist/worker/TrackAnalyzerWorker.min.js");

    var serviceWorkerAssetsList = assets.concat("dist/main.min.js", "index.html", "/").sort();
    var assetsCode = "const assets = " + JSON.stringify(serviceWorkerAssetsList, null, 4) + ";\n";
    var buildDate = "const buildDate = '" + new Date().toUTCString()+ "';\n";
    var code = "// AUTOMATICALLY GENERATED FILE DO NOT EDIT\n" + licenseHeader + assetsCode +  buildDate;

    return gulp.src("sw_base.js")
                .pipe(rename("sw.js"))
                .pipe(buffer())
                .pipe(replace(/^/, code))
                .pipe(sourcemaps.init({loadMaps: true}))
                .pipe(gulpUglify({preserveComments: "license"}))
                .pipe(sourcemaps.write("."))
                .pipe(gulp.dest("."));
}

function bundleSass() {
    mkdirp("dist/css");
    return Promise.resolve(gulp.src("sass/**/*.scss")
                .pipe(sourcemaps.init({loadMaps: true}))
                .pipe(sass({outputStyle: "compressed", recursive: true}).on("error", sass.logError))
                .pipe(sourcemaps.write("."))
                .pipe(gulp.dest("dist/css"))).then(function() {
            var criticalCss = fs.readFileSync("dist/css/critical.css", "utf8").replace(/\.\.\/(.+?)\//g, "dist/$1/");
            criticalCss = '<style type="text/css">' + criticalCss + '</style>';
            return gulp.src("index_base.html").pipe(replace("$critical_css", criticalCss))
                                .pipe(rename("index.html"))
                                .pipe(gulp.dest("."));
        });

}

function build() {
    return Promise.all([
        bundleSass(),
        bundleGui(true),
        bundleAudioPlayerBackend(true),
        bundleTrackAnalyzerBackend(true),
        bundleCodecs(true),
        bundleServiceWorker()
    ]);
}

function runWatchSass() {
    return Promise.resolve(gulp.src("sass/**/*.scss")
            .pipe(sass({recursive: true}).on("error", sass.logError))
            .pipe(gulp.dest("dist/css")));
}


gulp.task("lint", function() {
    return gulp.src("src/**/*.js").pipe(jshint(".jshintrc")).pipe(jshint.reporter("jshint-stylish"));
});

gulp.task("gui", bundleGui.bind(null, false));
gulp.task("audio-player", bundleAudioPlayerBackend.bind(null, false));
gulp.task("codecs", bundleCodecs.bind(null, false));
gulp.task("track-analyzer", bundleTrackAnalyzerBackend.bind(null, false));

gulp.task("runwatch:sass", runWatchSass);
gulp.task('watch:css', function () {
  mkdirp("dist/css");
  runWatchSass().then(function() {
    gulp.watch('sass/**/*.scss', ['runwatch:sass']);
  });
});

["gui", "audio-player", "codecs", "track-analyzer"].forEach(function(v) {
    gulp.task("watch:" + v, function() {
        gulp.watch("src/**/*.js", [v]);
    });
});

gulp.task("build", build);
