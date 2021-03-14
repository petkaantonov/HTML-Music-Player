import { Readable } from "stream";
import mkdirp from "mkdirp";
import gulp from "gulp";
import { sync as glob } from "glob";
import source from "vinyl-source-stream";
import rollup from "@rollup/stream";
import * as actualRollup from "rollup";
import * as io from "io-ts";
import sourcemaps from "gulp-sourcemaps";
import replace from "gulp-replace";
import buffer from "vinyl-buffer";
import { promisify, promisifyAll } from "bluebird";
import fs from "fs";
promisifyAll(fs);
import includePaths from "rollup-plugin-includepaths";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve, { DEFAULTS } from "@rollup/plugin-node-resolve";
import rename from "gulp-rename";
import sass from "gulp-sass";
import pumpCb from "pump";

const a = process.exit;
process.exit = function (...args) {
    console.log("process exited");
    console.log(args);
    return a(...args);
};
const pump = promisify(pumpCb) as (streams: pumpCb.Stream[]) => Promise<void>;
import eslint from "gulp-eslint";
import gulpIf from "gulp-if";
import exec from "./scripts/exec";
import minimist from "minimist";
// eslint-disable-next-line no-undef
const argv = minimist(process.argv.slice());
const { releaseVersion } = argv;

import gulpMinify from "gulp-babel-minify";

const licenseHeader = fs.readFileSync(`./LICENSE_header`, `utf8`).replace(/[^/]+$/, ``);
const RELEASE = io.literal(1);
const DEBUG = io.literal(2);
const Target = io.union([io.literal(1), io.literal(2), io.literal(3)]);
type Target = io.TypeOf<typeof Target>;

const BundleOpts = io.type({
    target: Target,
});
type IOBuildOpts = io.TypeOf<typeof BundleOpts>;
interface BuildOpts extends IOBuildOpts {
    input: string;
    format: actualRollup.ModuleFormat;
    name: string;
    banner?: string;
}

function bundleJs(opts: BuildOpts) {
    opts = Object(opts);
    const { input, format, name } = opts;
    const banner = opts.banner || ``;

    const plugins = [
        includePaths({
            include: {},
            paths: [`src`, `vendor`],
            external: [],
            extensions: [`.js`],
        }),
        nodeResolve(DEFAULTS),
        commonjs({
            include: [`node_modules/**`],
        }),
    ];

    const args: actualRollup.RollupOptions = {
        input,
        plugins,
        output: {
            sourcemap: false,
            banner,
            format,
            name,
        },
    };

    let full: Readable | null = null;
    let minified: Readable | null = null;

    if (opts.target & DEBUG.value) {
        full = rollup(args);
    }
    if (opts.target & RELEASE.value) {
        (args.output as actualRollup.OutputOptions).sourcemap = true;
        /* Plugins.push(rollupMinify({
            sourcemap: true,
            comments: false,
            banner: licenseHeader
        }));*/
        minified = rollup(args);
    }

    return {
        full,
        minified,
    };
}

function bundleGui(target: Target) {
    const bundles = bundleJs({
        input: `src/bootstrap.js`,
        name: `bootstrap`,
        format: `iife`,
        banner: licenseHeader,
        target,
    });

    let full: Promise<void>, minified: Promise<void>;

    if (target & DEBUG.value) {
        full = pump([bundles.full, source(`main.js`), buffer(), gulp.dest(`dist`)]);
    }

    if (target & RELEASE.value) {
        minified = pump([
            bundles.minified,
            source(`main.min.js`),
            buffer(),
            sourcemaps.init({ loadMaps: true }),
            sourcemaps.write(`.`),
            gulp.dest(`dist`),
        ]);
    }
    return Promise.all([full, minified]);
}

async function bundleZipperWorker(target: Target) {
    const input = `src/zip/ZipperWorker.js`;
    const name = `ZipperWorker`;
    await mkdirp(`dist/worker`);

    const bundles = bundleJs({
        input,
        name,
        format: `iife`,
        banner: licenseHeader,
        target,
    });

    let full, minified;

    if (target & DEBUG.value) {
        full = pump([
            bundles.full,
            source(`${name}.js`),
            buffer(),
            replace(/^/, `self.DEBUGGING = true;\n`),
            gulp.dest(`dist/worker`),
        ]);
    }

    if (target & RELEASE.value) {
        let globals = `self.DEBUGGING = false;\n`;
        if (releaseVersion) {
            globals += `self.VERSION = "${releaseVersion}";\n`;
        }
        minified = pump([
            bundles.minified,
            source(`${name}.min.js`),
            buffer(),
            sourcemaps.init({ loadMaps: true }),
            replace(/^/, globals),
            sourcemaps.write(`.`),
            gulp.dest(`dist/worker`),
        ]);
    }
    return Promise.all([full, minified]);
}

async function bundleWorkerBackend(target: Target) {
    const input = `src/WorkerBackend.js`;
    const name = `WorkerBackend`;
    await mkdirp(`dist/worker`);

    const bundles = bundleJs({
        input,
        name,
        format: `iife`,
        banner: licenseHeader,
        target,
    });

    let full, minified;

    if (target & DEBUG.value) {
        full = pump([
            bundles.full,
            source(`${name}.js`),
            buffer(),
            replace(/^/, `self.DEBUGGING = true;\n`),
            gulp.dest(`dist/worker`),
        ]);
    }

    if (target & RELEASE.value) {
        let globals = `self.DEBUGGING = false;\n`;
        if (releaseVersion) {
            globals += `self.VERSION = "${releaseVersion}";\n`;
        }
        minified = pump([
            bundles.minified,
            source(`${name}.min.js`),
            buffer(),
            sourcemaps.init({ loadMaps: true }),
            replace(/^/, globals),
            sourcemaps.write(`.`),
            gulp.dest(`dist/worker`),
        ]);
    }
    return Promise.all([full, minified]);
}

function getServiceWorkerGeneratedCode() {
    const assets = [`dist/css/app-css-public.min.css`]
        .concat(glob(`dist/images/**/*.*`))
        .concat(glob(`dist/fonts/**/*.woff*`))
        .concat(`dist/worker/WorkerBackend.min.js`, `dist/worker/wasm/main.release.wasm`);

    const serviceWorkerAssetsList = assets.concat(`dist/main.min.js`, `index.html`, `/`).sort();
    const assetsCode = `const assets = ${JSON.stringify(serviceWorkerAssetsList, null, 4).replace(/"/g, `\``)};\n`;
    const buildDate = `const buildDate = \`${new Date().toUTCString()}\`;\n`;
    let code = `// AUTOMATICALLY GENERATED FILE DO NOT EDIT\n${licenseHeader}${assetsCode}${buildDate}`;

    if (releaseVersion) {
        code += `const version = "${releaseVersion}";`;
    }

    return code;
}

function bundleServiceWorker() {
    const input = `sw_base.js`;
    const name = `ServiceWorker`;
    const bundles = bundleJs({
        input,
        name,
        format: `iife`,
        banner: ``,
        target: DEBUG.value,
    });

    return pump([
        bundles.full,
        source(`sw.js`),
        buffer(),
        replace(/^/, getServiceWorkerGeneratedCode()),
        sourcemaps.init({ loadMaps: true }),
        gulpMinify(),
        sourcemaps.write(`.`),
        gulp.dest(`.`),
    ]);
}

async function bundleSass() {
    await mkdirp(`dist/css`);
    await pump([
        gulp.src(`sass/**/*.scss`),
        sass({ outputStyle: `compressed`, recursive: true }),
        gulp.dest(`dist/css`),
    ]);

    let criticalCss = fs.readFileSync(`dist/css/critical.css`, `utf8`).replace(/\.\.\/(.+?)\//g, `dist/$1/`);
    criticalCss = `<style type="text/css">${criticalCss}</style>`;
    await pump([
        gulp.src(`index_base.html`),
        replace(`$critical_css`, criticalCss),
        replace(`$VERSION`, `${releaseVersion}`),
        rename(`index.html`),
        gulp.dest(`.`),
    ]);
}

async function cpWasm(target: Target): Promise<void> {
    await mkdirp(`dist/worker/wasm`);
    if (target & DEBUG.value) {
        await Promise.all([
            exec(`cp wasm/main.debug.wasm dist/worker/wasm/main.debug.wasm`),
            exec(`cp wasm/zip.debug.wasm dist/worker/wasm/zip.debug.wasm`),
        ]);
    } else if (target & RELEASE.value) {
        await Promise.all([
            exec(`cp wasm/main.release.wasm dist/worker/wasm/main.release.wasm`),
            exec(`cp wasm/zip.release.wasm dist/worker/wasm/zip.release.wasm`),
        ]);
    }
}

async function build() {
    return Promise.all([
        bundleSass(),
        bundleGui(RELEASE.value),
        bundleWorkerBackend(RELEASE.value),
        bundleZipperWorker(RELEASE.value),
        bundleServiceWorker(),
        cpWasm(RELEASE.value),
    ]);
}

async function buildDebug() {
    return Promise.all([
        bundleSass(),
        bundleGui(DEBUG.value),
        bundleWorkerBackend(DEBUG.value),
        bundleZipperWorker(DEBUG.value),
        bundleServiceWorker(),
        cpWasm(DEBUG.value),
    ]);
}

function runWatchSass() {
    return gulp
        .src(`sass/**/*.scss`)
        .pipe(sass({ recursive: true }))
        .pipe(gulp.dest(`dist/css`));
}

gulp.task("src-lint", () => {
    function isFixed(file) {
        return file.eslint && file.eslint.fixed;
    }
    return gulp
        .src(`src/**/*.js`)
        .pipe(buffer())
        .pipe(eslint({ fix: true }))
        .pipe(eslint.format())
        .pipe(gulpIf(isFixed, gulp.dest("src")));
});

gulp.task("sw-lint", () => {
    return gulp
        .src(`sw_base.js`)
        .pipe(buffer())
        .pipe(replace(/^/, getServiceWorkerGeneratedCode()))
        .pipe(eslint({ fix: false }))
        .pipe(eslint.format());
});

gulp.task(`lint`, gulp.parallel("sw-lint", "src-lint"));

gulp.task(`gui`, bundleGui.bind(null, DEBUG));
gulp.task(`nongui`, () => Promise.all([bundleWorkerBackend(DEBUG.value), bundleZipperWorker(DEBUG.value)]));

gulp.task(`runwatch:sass`, runWatchSass);
gulp.task(`watch:css`, async () => {
    await mkdirp(`dist/css`);
    await runWatchSass();
    gulp.watch(`sass/**/*.scss`, gulp.series(`runwatch:sass`));
});

gulp.task(
    `watch:gui`,
    gulp.series(`gui`, () => {
        gulp.watch(`src/**/*.js`, gulp.series(`gui`));
    })
);

gulp.task(
    `watch:nongui`,
    gulp.series(`nongui`, () => {
        gulp.watch(`src/**/*.js`, gulp.series(`nongui`));
    })
);

gulp.task(`build`, gulp.series(`lint`, build));
gulp.task(`build-debug`, gulp.series(`lint`, buildDebug));
gulp.task(`build-debug-nolint`, buildDebug);
gulp.task(`build-nolint`, build);

gulp.on(`err`, e => {
    // eslint-disable-next-line no-console,no-undef
    console.log(e);
});

process.on("unhandledRejection", (e: Error) => {
    console.error(e.message);
    console.error(e.stack);
});
process.on("uncaughtException", (e: Error) => {
    console.error(e.message);
    console.error(e.stack);
});
