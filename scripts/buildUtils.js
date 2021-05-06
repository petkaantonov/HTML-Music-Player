const fs = require("fs/promises")
const path = require("path")
const util = require('util');
const cp = require("child_process")
const exec = util.promisify(cp.exec);

exports.gitRevision = () => {
    return exec("git rev-parse HEAD").then(v => v.stdout.trim())
};

exports.gitRevisionSync = () => {
    return cp.execSync("git rev-parse HEAD", {encoding: "utf-8"}).trim()
};

exports.performReplacements = function (contents, values) {
    const rvar = /\$([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    return contents.replace(rvar, (_m, valName) => {
        if (values[valName] === undefined) {
            throw new Error("$" + valName + " in " + src + " not defined")
        }
        return values[valName]
    });
}
exports.copyWithReplacements = async function({src, values, dst}) {
    src = path.join(process.cwd(), src)
    dst = path.join(process.cwd(), dst)
    const contents = exports.performReplacements(await fs.readFile(src, "utf-8"), values)
    await fs.writeFile(dst, contents, "utf-8")
};

exports.vendorResolverPlugin = function() {
    const expr = /vendor\/(.+)/
    return {
        name: "vendor-resolver-plugin",
        setup: function({onResolve}) {
            onResolve({filter: expr}, async (args) => {
                const name = expr.exec(args.path)[1]
                const fullPath = path.join(process.cwd(), "../vendor", "src", name + ".js")
                return {
                    path: fullPath
                }
            })
        }
    }
};
