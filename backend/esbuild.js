const pnpPlugin = require("@yarnpkg/esbuild-plugin-pnp");
const tsConfigPathsPlugin = require("@esbuild-plugins/tsconfig-paths");
const { gitRevisionSync, copyWithReplacements, vendorResolverPlugin } = require("../scripts/buildUtils");
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

const bundleP = esbuild.build({
    target,
    platform: "node",
    bundle: true,
    logLevel: "error",
    entryPoints: ["src/index.ts"],
    sourcemap: true,
    minify: true,
    metafile: false,
    define,
    outfile: "dist/index.js",
    plugins: [tsConfigPathsPlugin.default({}), pnpPlugin.pnpPlugin()],
    watch: isWatch,
});

(async () => {
    await bundleP;
    // eslint-disable-next-line no-console
    console.log("built backend", revision, buildType);
})();
