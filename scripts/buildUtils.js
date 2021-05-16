/* eslint-disable no-console */
const fs = require("fs/promises");
const path = require("path");
const util = require("util");
const cp = require("child_process");
const chokidar = require("chokidar");
const exec = util.promisify(cp.exec);

exports.logResult = result => {
    for (const error of result.errors) {
        console.error(error.message);
    }
    for (const warning of result.warnings) {
        if (warning.text !== "Unsupported source map comment") {
            console.warn(warning.text, warning.location);
        }
    }
};

const rpnp = /^pnp:/;
exports.watch = async (build, entry, project, onRebuild) => {
    const absEntry = path.join(process.cwd(), entry);
    const projectPath = path.join(path.dirname(__dirname), project);
    function getInputs(result) {
        const values = Object.keys(result.metafile.inputs);
        const ret = [];
        for (let val of values) {
            if (val.startsWith("pnp:")) {
                val = val.replace(rpnp, "");
                if (!val.includes(".yarn")) {
                    ret.push(val);
                }
            } else {
                if (!path.isAbsolute(val)) {
                    val = path.join(projectPath, val);
                }
                ret.push(val);
            }
        }
        return Array.from(new Set(ret));
    }

    const now = Date.now();
    const result = await build();
    console.log("built", absEntry, Date.now() - now, "ms");
    let awaitingBuildP = null;
    let watchedPaths = getInputs(result);
    const watcher = chokidar.watch(watchedPaths, {
        persistent: true,
        ignoreInitial: true,
    });
    watcher.on("all", async eventName => {
        console.log("rebuilding", absEntry);
        if (awaitingBuildP) {
            try {
                await awaitingBuildP;
            } catch {}
        }
        const now = Date.now();
        awaitingBuildP = build();
        try {
            const result = await awaitingBuildP;
            console.log("rebuilt", absEntry, Date.now() - now, "ms");
            if (!result.errors.length) {
                const newWatchedPaths = getInputs(result);
                const diff = exports.diffPaths(watchedPaths, newWatchedPaths);
                if (diff.pathsToRemove.length) watcher.unwatch(diff.pathsToRemove);
                if (diff.pathsToAdd.length) watcher.add(diff.pathsToAdd);
                watchedPaths = newWatchedPaths;
                if (onRebuild) {
                    onRebuild();
                }
            }
        } catch (e) {
            console.error(e.message);
        }
    });
    if (!result.errors.length && onRebuild) {
        onRebuild();
    }
};

exports.diffPaths = (oldPaths, newPaths) => {
    const pathsToRemove = [];
    const pathsToAdd = [];

    const oldPathsSet = new Set(oldPaths);
    const newPathsSet = new Set(newPaths);

    for (const oldPath of oldPaths) {
        if (!newPathsSet.has(oldPath)) {
            pathsToRemove.push(oldPath);
        }
    }
    for (const newPath of newPaths) {
        if (!oldPathsSet.has(newPath)) {
            pathsToAdd.push(newPath);
        }
    }
    return { pathsToRemove, pathsToAdd };
};

exports.gitRevision = () => {
    return exec("git rev-parse HEAD").then(v => v.stdout.trim());
};

exports.gitRevisionSync = () => {
    return cp.execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
};

exports.performReplacements = function (contents, values) {
    const rvar = /\$([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    return contents.replace(rvar, (_m, valName) => {
        if (values[valName] === undefined) {
            throw new Error("$" + valName + " is not defined");
        }
        return values[valName];
    });
};
exports.copyWithReplacements = async function ({ src, values, dst }) {
    src = path.join(process.cwd(), src);
    dst = path.join(process.cwd(), dst);
    const contents = exports.performReplacements(await fs.readFile(src, "utf-8"), values || {});
    await fs.writeFile(dst, contents, "utf-8");
};

exports.vendorResolverPlugin = function () {
    const expr = /vendor\/(.+)/;
    return {
        name: "vendor-resolver-plugin",
        setup: function ({ onResolve }) {
            onResolve({ filter: expr }, async args => {
                const name = expr.exec(args.path)[1];
                const fullPath = path.join(process.cwd(), "../vendor", "src", name + ".js");
                return {
                    path: fullPath,
                };
            });
        },
    };
};
