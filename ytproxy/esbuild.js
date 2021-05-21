const forceWorkDir = [process.argv.find(v => v.startsWith("--workdir=/"))]
    .filter(v => !!v)
    .map(v => v.match(/--workdir=(.+)/)[1])[0];
if (forceWorkDir) {
    process.chdir(forceWorkDir);
}
const pnpPlugin = require("@yarnpkg/esbuild-plugin-pnp");
const tsConfigPathsPlugin = require("@esbuild-plugins/tsconfig-paths");
const {
    gitRevisionSync,
    watch,
    logResult,
    vendorResolverPlugin,
    copyWithReplacements,
} = require("../scripts/buildUtils");
const esbuild = require("esbuild");
const target = "es2020";
const revision = gitRevisionSync();
const isWatch = !!process.argv.includes("--watch");
const forceProduction = !!process.argv.includes("--production");
const forceDevelopment = !!process.argv.includes("--development");

const buildType = forceProduction
    ? "production"
    : forceDevelopment
    ? "development"
    : process.env.NODE_ENV || (isWatch ? "development" : "production");

const define = {
    "process.env.REVISION": `"${revision}"`,
    "process.env.SERVER_ENV": `"${buildType}"`,
    "process.env.WORKER_PATH": `"./worker.js"`,
};

async function bundleJs(entry, outfile, onRebuild) {
    async function build() {
        const result = await esbuild.build({
            target,
            platform: "node",
            bundle: true,
            logLevel: "error",
            entryPoints: [entry],
            sourcemap: true,
            minify: buildType === "production",
            metafile: isWatch,
            define,
            outfile,
            plugins: [vendorResolverPlugin(__dirname), tsConfigPathsPlugin.default({}), pnpPlugin.pnpPlugin()],
            incremental: isWatch,
        });

        logResult(result);

        return result;
    }

    if (isWatch) {
        watch(build, entry, "ytproxy", onRebuild);
    } else {
        const ret = await build();
        if (onRebuild && !ret.errors.length) {
            await onRebuild();
        }
        return ret;
    }
}

(async () => {
    await copyWithReplacements({ src: "vendor/ffmpeg-core.wasm", dst: "dist/ffmpeg-core.wasm", binary: true });
    await bundleJs("src/index.ts", "dist/index.js");
    await bundleJs("src/worker.ts", "dist/worker.js");
})();
