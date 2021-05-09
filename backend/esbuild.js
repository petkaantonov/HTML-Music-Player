const forceWorkDir = [process.argv.find(v => v.startsWith("--workdir=/"))]
    .filter(v => !!v)
    .map(v => v.match(/--workdir=(.+)/)[1])[0];
if (forceWorkDir) {
    process.chdir(forceWorkDir);
}
const pnpPlugin = require("@yarnpkg/esbuild-plugin-pnp");
const tsConfigPathsPlugin = require("@esbuild-plugins/tsconfig-paths");
const { gitRevisionSync, watch, logResult } = require("../scripts/buildUtils");
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
};

async function build() {
    const result = await esbuild.build({
        target,
        platform: "node",
        bundle: true,
        logLevel: "error",
        entryPoints: ["src/index.ts"],
        sourcemap: true,
        minify: true,
        metafile: isWatch,
        define,
        outfile: "dist/index.js",
        plugins: [tsConfigPathsPlugin.default({}), pnpPlugin.pnpPlugin()],
        incremental: isWatch,
    });

    logResult(result);

    return result;
}

(async () => {
    if (isWatch) {
        watch(build, "src/index.ts");
    } else {
        await build();
        // eslint-disable-next-line no-console
        console.log("built backend", revision, buildType);
    }
})();
