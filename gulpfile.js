var gulp = require('gulp');
var del = require('del');
var mkdirp = require("mkdirp").sync;
var glob = require("glob").sync;
var source = require('vinyl-source-stream');
var rollup = require('rollup-stream');
var actualRollup = require("rollup");
var sourcemaps = require('gulp-sourcemaps');
var replace = require('gulp-replace');
var path = require('path');
var buffer = require('vinyl-buffer');
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require('fs'));
var includePaths = require("rollup-plugin-includepaths");
var commonjs = require("rollup-plugin-commonjs");
var nodeResolve = require("rollup-plugin-node-resolve");
var rename = require("gulp-rename");
var sass = require('gulp-sass');
var pump = Promise.promisify(require("pump"));
var eslint = require("gulp-eslint");
var gulpIf = require("gulp-if");

var gulpMinify = require("gulp-babili");
var rollupMinify = require("rollup-plugin-babili");

var licenseHeader = fs.readFileSync("./LICENSE_header", "utf8").replace(/[^\/]+$/, "");
var RELEASE = 1 << 0;
var DEBUG = 1 << 1;

function bundleJs(opts) {
    opts = Object(opts);
    var entry = opts.entry;
    var format = opts.format;
    var banner = opts.banner || "";
    var moduleName = opts.moduleName;

    var plugins = [includePaths({
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
        plugins.push(rollupMinify({
            sourceMap: true,
            comments: false,
            banner: licenseHeader
        }));
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

function bundleWorkerBackend(target) {
    var entry = "src/WorkerBackend.js";
    var name = "WorkerBackend";
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

function getServiceWorkerGeneratedCode() {
    var assets = ["dist/css/app-css-public.min.css"]
                    .concat(glob("dist/images/**/*.*"))
                    .concat(glob("dist/fonts/**/*.woff*"))
                    .concat("dist/worker/WorkerBackend.min.js", "dist/worker/wasm/main.release.wasm");

    var serviceWorkerAssetsList = assets.concat("dist/main.min.js", "index.html", "/").sort();
    var assetsCode = "const assets = " + JSON.stringify(serviceWorkerAssetsList, null, 4).replace(/"/g, '`') + ";\n";
    var buildDate = "const buildDate = `" + new Date().toUTCString()+ "`;\n";
    var code = "// AUTOMATICALLY GENERATED FILE DO NOT EDIT\n" + licenseHeader + assetsCode + buildDate;
    return code;
}

function bundleServiceWorker() {
    return pump([gulp.src("sw_base.js"),
        rename("sw.js"),
        buffer(),
        replace(/^/, getServiceWorkerGeneratedCode()),
        sourcemaps.init({loadMaps: true}),
        gulpMinify(),
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
        bundleWorkerBackend(RELEASE),
        bundleServiceWorker()
    ]);
}

function buildDebug() {
    return Promise.all([
        bundleSass(),
        bundleGui(DEBUG),
        bundleWorkerBackend(DEBUG),
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

    function isFixed(file) {
        return file.eslint && file.eslint.fixed;
    }

    var swLint = pump([gulp.src("sw_base.js"),
        buffer(),
        replace(/^/, getServiceWorkerGeneratedCode()),
        eslint({fix: false}),
        eslint.format()
    ]);

    var srcLint = pump([
        gulp.src(["src/**/*.js"]),
        eslint({fix: true}),
        eslint.format(),
        gulpIf(isFixed, gulp.dest("src"))
    ]);

    return Promise.all([srcLint, swLint]);
});

gulp.task("gui", bundleGui.bind(null, DEBUG));
gulp.task("nongui", function() {
    return Promise.all([
        bundleWorkerBackend(DEBUG)
    ]);
})

gulp.task("runwatch:sass", runWatchSass);
gulp.task('watch:css', function () {
  mkdirp("dist/css");
  runWatchSass().then(function() {
    gulp.watch('sass/**/*.scss', ['runwatch:sass']);
  });
});

gulp.task("watch:gui", ["gui"], function() {
    gulp.watch("src/**/*.js", ["gui"]);
});

gulp.task("watch:nongui", ["nongui"], function() {
    gulp.watch("src/**/*.js", ["nongui"]);
});

gulp.task("build", ["lint"], build);
gulp.task("build-debug", ["lint"], buildDebug);
gulp.task("build-debug-nolint", buildDebug);
gulp.task("build-nolint", build);

gulp.on("err", function(e) {
    console.log(e);
})
