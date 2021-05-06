const pnpPlugin = require("@yarnpkg/esbuild-plugin-pnp");
const tsConfigPathsPlugin = require("@esbuild-plugins/tsconfig-paths");
const sassPlugin = require("esbuild-plugin-sass");
const {
    gitRevisionSync,
    copyWithReplacements,
    vendorResolverPlugin,
    performReplacements,
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
    "process.env.GENERAL_WORKER_PATH": `"${resolveWebPath(outputAssets.generalWorker)}"`,
    "process.env.AUDIO_WORKER_PATH": `"${resolveWebPath(outputAssets.audioWorker)}"`,
    "process.env.VISUALIZER_WORKER_PATH": `"${resolveWebPath(outputAssets.visualizerWorker)}"`,
    "process.env.ZIPPER_WORKER_PATH": `"${resolveWebPath(outputAssets.zipperWorker)}"`,
    "process.env.AUDIO_WASM_PATH": `"${resolveWebPath(outputAssets.audioWasm)}"`,
    "process.env.ZIPPER_WASM_PATH": `"${resolveWebPath(outputAssets.zipperWasm)}"`,
    "process.env.SERVICE_WORKER_PATH": `"${resolveWebPath(serviceWorkerOutput)}"`,
    "process.env.MP3_CODEC_PATH": `"${resolveWebPath(outputAssets.mp3Codec)}"`,
    "process.env.REVISION": `"${revision}"`,
};

const imageAssetsP = fg(["images/**/*"]);

function bundleSass(entry, outfile) {
    return esbuild.build({
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
        minify: true,
        bundle: true,
        metafile: false,
    });
}

function bundleJs(entry, outfile) {
    const plugins = [vendorResolverPlugin(), tsConfigPathsPlugin.default({}), pnpPlugin.pnpPlugin()];
    return esbuild.build({
        target,
        entryPoints: [entry],
        loader,
        bundle: true,
        logLevel: "error",
        assetNames: "assets/[name]-[hash]",
        minify: true,
        sourcemap: isDevelopment,
        metafile: false,
        outfile,
        plugins,
        treeShaking: true,
        define,
    });
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

const criticalCssP = bundleSass("sass/critical.scss", outputAssets.criticalCss);
const regularCssP = bundleSass("sass/app-css-public.scss", outputAssets.appCss);
const uibuildP = bundleJs("src/bootstrap.ts", outputAssets.appJs);
const generalWorkerP = bundleJs("../general-worker/src/GeneralWorker.ts", outputAssets.generalWorker);
const audioWorkerP = bundleJs("../audio-worker/src/AudioWorker.ts", outputAssets.audioWorker);
const visualizerWorkerP = bundleJs("../visualizer-worker/src/VisualizerWorker.ts", outputAssets.visualizerWorker);
const zipperWorkerP = bundleJs("../zipper-worker/src/ZipperWorker.ts", outputAssets.zipperWorker);
const swBuildP = bundleJs("../service-worker/src/sw_base.ts", serviceWorkerOutput);
const mp3CodecBuildP = bundleJs("../shared/src/worker/mp3.ts", outputAssets.mp3Codec);
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
        fs.writeFile(
            serviceWorkerOutput,
            (await fs.readFile(serviceWorkerOutput, "utf-8")).replace(/^/, swCode),
            "utf-8"
        ),
    ]);

    // eslint-disable-next-line no-console
    console.log("built ui", revision, buildType);
})();
