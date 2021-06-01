/* eslint-disable no-console */
const forceWorkDir = [process.argv.find(v => v.startsWith("--workdir=/"))]
    .filter(v => !!v)
    .map(v => v.match(/--workdir=(.+)/)[1])[0];
if (forceWorkDir) {
    process.chdir(forceWorkDir);
}
const pnpPlugin = require("@yarnpkg/esbuild-plugin-pnp");
const tsConfigPathsPlugin = require("@esbuild-plugins/tsconfig-paths");
const sassPlugin = require("esbuild-plugin-sass");
const {
    gitRevisionSync,
    copyWithReplacements,
    vendorResolverPlugin,
    performReplacements,
    watch,
    logResult,
} = require("../scripts/buildUtils");
const esbuild = require("esbuild");
const copy = require("recursive-copy");
const fs = require("fs/promises");
const path = require("path");
const fg = require("fast-glob");
const isWatch = !!process.argv.includes("--watch");

const forceProduction = !!process.argv.includes("--production");
const forceDevelopment = !!process.argv.includes("--development");

const buildType = forceProduction
    ? "production"
    : forceDevelopment
    ? "development"
    : process.env.NODE_ENV || (isWatch ? "development" : "production");
const isDevelopment = buildType === "development";
const isProduction = buildType === "production";
const revision = gitRevisionSync();
const urlBase = "http://localhost:8140";

function resolveWebPath(assetPath) {
    const distPath = path.join(process.cwd(), "../dist");
    const fullPath = path.join(process.cwd(), assetPath);
    return `${urlBase}/${path.relative(distPath, fullPath)}`;
}

const target = "es2020";

const loader = {
    ".woff": "file",
    ".woff2": "file",
    ".json": "file",
    ".png": "file",
    ".xml": "file",
};

const serviceWorkerOutput = "../dist/sw.js";

const outputAssets = {
    mp3Codec: `../dist/codecs/mp3.js`,
    audioWasm: `../dist/wasm/audio.${buildType}.wasm`,
    zipperWasm: `../dist/wasm/zipper.${buildType}.wasm`,
    generalWasm: `../dist/wasm/general.${buildType}.wasm`,
    generalWorker: "../dist/generalWorker.js",
    audioWorker: "../dist/audioWorker.js",
    visualizerWorker: "../dist/visualizerWorker.js",
    zipperWorker: "../dist/zipperWorker.js",
    criticalCss: "../dist/critical.css",
    appCss: "../dist/app.css",
    appJs: "../dist/app.js",
    index: "../dist/index.html",
    manifestJson: "../dist/assets/manifest.json",
    browserConfig: "../dist/assets/browserconfig.xml",
};

const define = {
    "process.env.NODE_ENV": isDevelopment ? '"development"' : '"production"',
    "process.env.DEBUG": isDevelopment ? "true" : "false",
    "process.env.IMAGE_PATH": `"${resolveWebPath("../dist/assets/images")}"`,
    "process.env.GENERAL_WORKER_PATH": `"${resolveWebPath(outputAssets.generalWorker)}"`,
    "process.env.AUDIO_WORKER_PATH": `"${resolveWebPath(outputAssets.audioWorker)}"`,
    "process.env.VISUALIZER_WORKER_PATH": `"${resolveWebPath(outputAssets.visualizerWorker)}"`,
    "process.env.ZIPPER_WORKER_PATH": `"${resolveWebPath(outputAssets.zipperWorker)}"`,
    "process.env.AUDIO_WASM_PATH": `"${resolveWebPath(outputAssets.audioWasm)}"`,
    "process.env.GENERAL_WASM_PATH": `"${resolveWebPath(outputAssets.generalWasm)}"`,
    "process.env.ZIPPER_WASM_PATH": `"${resolveWebPath(outputAssets.zipperWasm)}"`,
    "process.env.SERVICE_WORKER_PATH": `"${resolveWebPath(serviceWorkerOutput)}"`,
    "process.env.MP3_CODEC_PATH": `"${resolveWebPath(outputAssets.mp3Codec)}"`,
    "process.env.REVISION": `"${revision}"`,
};

async function bundleSass(entry, outfile, project, onRebuild) {
    async function build() {
        const result = await esbuild.build({
            target,
            loader: {
                ...loader,
                ".png": "dataurl",
                ".woff": "dataurl",
                ".woff2": "dataurl",
            },
            entryPoints: [entry],
            outfile,
            plugins: [sassPlugin()],
            pure: ["console.log", "debugFor", "setDebugConfig", "dbg"],
            minify: isProduction,
            minifySyntax: isProduction,
            bundle: true,
            metafile: isWatch,
            incremental: isWatch,
        });

        logResult(result);

        return result;
    }

    if (isWatch) {
        watch(build, entry, project, onRebuild);
    } else {
        const ret = await build();
        if (onRebuild && !ret.errors.length) {
            await onRebuild();
        }
        return ret;
    }
}

async function bundleJs(entry, outfile, project, onRebuild) {
    const plugins = [
        vendorResolverPlugin(path.dirname(__dirname), path.join("vendor", "src")),
        tsConfigPathsPlugin.default({}),
        pnpPlugin.pnpPlugin(),
    ];

    async function build() {
        const result = await esbuild.build({
            target,
            entryPoints: [entry],
            loader,
            bundle: true,
            logLevel: "silent",
            assetNames: "assets/[name]-[hash]",
            minify: isProduction,
            pure: ["console.log"],
            minifySyntax: isProduction,
            sourcemap: isDevelopment,
            metafile: isWatch,
            outfile,
            plugins,
            treeShaking: true,
            define,
            incremental: isWatch,
        });

        logResult(result);

        return result;
    }

    if (isWatch) {
        watch(build, entry, project, onRebuild);
    } else {
        const ret = await build();
        if (onRebuild && !ret.errors.length) {
            await onRebuild();
        }
        return ret;
    }
}

async function inlineJs(entry, replacements) {
    let contents = await fs.readFile(entry, "utf-8");
    if (replacements) {
        contents = performReplacements(contents, replacements);
    }
    const result = await esbuild.transform(contents, {
        target,
        minify: true,
    });
    return `data:text/javascript;base64,${Buffer.from(result.code, "utf-8").toString("base64")}`;
}

async function inlineCss(entry) {
    const contents = await fs.readFile(entry, "utf-8");
    return `data:text/css;base64,${Buffer.from(contents, "utf-8").toString("base64")}`;
}

const criticalCssP = bundleSass("sass/critical.scss", outputAssets.criticalCss, "ui");
const regularCssP = bundleSass("sass/app-css-public.scss", outputAssets.appCss, "ui");
const uibuildP = bundleJs("src/bootstrap.ts", outputAssets.appJs, "ui");
const generalWorkerP = bundleJs("../general-worker/src/GeneralWorker.ts", outputAssets.generalWorker, "general-worker");
const audioWorkerP = bundleJs("../audio-worker/src/AudioWorker.ts", outputAssets.audioWorker, "audio-worker");

const visualizerWorkerP = bundleJs(
    "../visualizer-worker/src/VisualizerWorker.ts",
    outputAssets.visualizerWorker,
    "visualizer-worker"
);
const zipperWorkerP = bundleJs("../zipper-worker/src/ZipperWorker.ts", outputAssets.zipperWorker, "zipper-worker");
const swBuildP = bundleJs("../service-worker/src/sw_base.ts", serviceWorkerOutput, "service-worker", async () => {
    try {
        fs.writeFile(
            serviceWorkerOutput,
            (await fs.readFile(serviceWorkerOutput, "utf-8")).replace(/^/, await getSwCode()),
            "utf-8"
        );
    } catch (e) {
        console.error(e.message);
    }
});
const mp3CodecBuildP = bundleJs("../shared/src/worker/mp3.ts", outputAssets.mp3Codec, "shared");

if (!isWatch) {
    const uiLogP = inlineJs("src/uilog.js");
    const cssLoadJs = inlineJs("src/cssload.js", { APP_CSS_PATH: resolveWebPath(outputAssets.appCss) });

    (async () => {
        await uibuildP;
        await criticalCssP;
        await regularCssP;
        await swBuildP;
        await generalWorkerP;
        await audioWorkerP;
        await visualizerWorkerP;
        await zipperWorkerP;
        await mp3CodecBuildP;

        await Promise.all([
            copy("images", "../dist/assets/images", { overwrite: true }),
            copy("wasm", "../dist/wasm", { overwrite: true }),
            copyWithReplacements({
                src: "sw/manifest.json",
                dst: outputAssets.manifestJson,
                values: {
                    IMAGE_PATH: resolveWebPath("../dist/assets/images"),
                },
            }),
            copyWithReplacements({
                src: "sw/browserconfig.xml",
                dst: outputAssets.browserConfig,
                values: {
                    IMAGE_PATH: resolveWebPath("../dist/assets/images"),
                },
            }),
            copyWithReplacements({
                src: "src/index_base.html",
                dst: outputAssets.index,
                values: {
                    UI_LOG_JS: await uiLogP,
                    CSS_LOAD_JS: await cssLoadJs,
                    VERSION: revision,
                    IS_DEVELOPMENT: isDevelopment,
                    IMAGE_PATH: resolveWebPath("../dist/assets/images"),
                    MANIFEST_PATH: resolveWebPath("../dist/assets"),
                    APP_CSS_PATH: resolveWebPath(outputAssets.appCss),
                    APP_JS_PATH: resolveWebPath(outputAssets.appJs),
                    CRITICAL_CSS: await inlineCss(outputAssets.criticalCss),
                },
            }),
        ]);

        // eslint-disable-next-line no-console
        console.log("built ui", revision, buildType);
    })();
}

async function getSwCode() {
    const revision = gitRevisionSync();
    const imageAssetsP = fg(["images/**/*"]);
    const imageAssets = (await imageAssetsP).map(v => resolveWebPath("../dist/assets/images/" + path.basename(v)));

    const assets = Object.values(outputAssets)
        .filter(v => !v.includes("critical.css"))
        .map(resolveWebPath)
        .concat(imageAssets)
        .sort();

    const swCode = `
        const assets = ${JSON.stringify(assets, null, 2)};
        const revision = "${revision}";
    `;

    return swCode;
}

/*, async result => {
    try {
        fs.writeFile(
            serviceWorkerOutput,
            (await fs.readFile(serviceWorkerOutput, "utf-8")).replace(/^/, await getSwCode()),
            "utf-8"
        );
    } catch (e) {
        console.error(e.message);
    }
});*/
