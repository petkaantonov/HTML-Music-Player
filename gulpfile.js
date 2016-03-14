var gulp = require('gulp');
var del = require('del');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var rollup = require('rollup-stream');
var uglify = require('rollup-plugin-uglify');
var gjslint = require('gulp-gjslint');
var sourcemaps = require('gulp-sourcemaps');
var replace = require('gulp-replace');
var path = require('path');
var buffer = require('vinyl-buffer');
var fs = require('fs');
var Promise = require("bluebird");
var includePaths = require("rollup-plugin-includepaths");
var commonjs = require("rollup-plugin-commonjs");
var nodeResolve = require("rollup-plugin-node-resolve");

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

function bundleGui() {
    var bundles = bundleJs({
        entry: "src/bootstrap.js",
        moduleName: "bootstrap",
        format: "iife",
        banner: "/* license */",
        min: true
    });

    var full = bundles.full.pipe(source("main.js"))
                .pipe(buffer())
                .pipe(sourcemaps.init({loadMaps: true}))
                .pipe(sourcemaps.write("."))
                .pipe(gulp.dest("dist"));

    var minified = bundles.minified.pipe(source("main.min.js"))
                    .pipe(buffer())
                    .pipe(sourcemaps.init({loadMaps: true}))
                    .pipe(sourcemaps.write("."))
                    .pipe(gulp.dest("dist"));
    return Promise.all([full, minified]);
}

gulp.task("gui", bundleGui);
