const projectDir = process.cwd();
const minimist = require("minimist");
const exec = require("./exec");
const fs = require("fs");
const Path = require("path");
const promisify = require("util").promisify;
const readFileAsync = promisify(fs.readFile);
const appendFileAsync = promisify(fs.appendFile);
const glob = promisify(require("glob"));
const exists = (path) => {
    return new Promise(resolve => {
        fs.exists(path, yesno => resolve(yesno ? path : false));
    });
};

const PAGE_SIZE = 65536;
const argv = minimist(process.argv.slice(2), {boolean: ["release"], boolean: ["ui"]});
const RELEASE = argv.release;
const WORKER = !argv.ui;
const STACK_SIZE = +(argv.stackSize || argv.s) || 128 * 1024;
const INITIAL_MEMORY = Math.ceil((+(argv.initialMemory || argv.i) || STACK_SIZE * 50) / PAGE_SIZE) * PAGE_SIZE;
const ENTRY = argv._[0] || "native/main.c";
const ENTRY_FILE_NAME = Path.basename(ENTRY, Path.extname(ENTRY));
const root = require("os").homedir();
const binaryenDir = `${root}/binaryen`
const binaryenBuildDir = `${binaryenDir}/build`;
const llvmDir = `${root}/llvmwasm`;
const llvmBuildDir = `${llvmDir}/build`;

async function tryDep(name, versionCall = null) {
    try {
        await exec(`which ${name}`, {doOut: false});
        if (versionCall) {
            return exec(`${name} ${versionCall}`, {doOut: false});
        } else {
            return true;
        }
    } catch (e) {
        return false
    }
}

async function applyPatch(patchFile) {
    console.log(`Applying patch from ${patchFile}`);
    await exec(`git am -3 < ${patchFile}`);
}

async function installBinaryen() {
    console.log(`Installing binaryen to ${binaryenDir}`)

    await exec(`mkdir -p ${binaryenDir}`);
    process.chdir(binaryenDir);

    try {
        await exec(`git clone https://github.com/WebAssembly/binaryen ${binaryenDir}`, {responseTimeout: 30 * 1000});
    } catch (e) {
        if (e.stderr.indexOf("already exists and is not an empty directory") >= 0) {
            await exec("git init", {doOut: false});
            try {
                await exec("git remote add origin https://github.com/WebAssembly/binaryen", {doOut: false});
            } catch (e) {
                if (e.stderr.indexOf("remote origin already exists") === -1) {
                    throw e;
                }
            }
            await exec("git fetch", {responseTimeout: 30 * 1000});
            await exec("git checkout origin/master", {doOut: false});
            await exec("git branch -D master", {doOut: false});
            await exec("git checkout -b master origin/master", {doOut: false});
        } else {
            throw e;
        }
    }

    const patches = await glob(`${projectDir}/scripts/patches/binaryen/**/*.patch`);
    patches.sort((a, b) => parseInt(a.slice(0,4)) - parseInt(b.slice(0,4)));
    for (let patch of patches) {
        await applyPatch(patch);
    }
    await exec(`mkdir -p ${binaryenBuildDir}`);
    process.chdir(binaryenBuildDir);
    await exec(`cmake -G "Unix Makefiles" -DCMAKE_INSTALL_PREFIX=${binaryenDir} -DCMAKE_BUILD_TYPE=Release ${binaryenDir}`);
    await exec(`make -C ${binaryenBuildDir} -j 4 wasm-as s2wasm wasm-opt`);
}

async function installLlvm() {
    console.log(`Installing llvm to ${llvmDir}`);
    await exec(`mkdir -p ${llvmDir}`);
    process.chdir(llvmDir);
    console.log(`svn co http://llvm.org/svn/llvm-project/llvm/trunk llvm`);
    await exec(`svn co http://llvm.org/svn/llvm-project/llvm/trunk llvm`);
    process.chdir(`${llvmDir}/llvm/tools`);
    console.log(`svn co --non-interactive --trust-server-cert http://llvm.org/svn/llvm-project/cfe/trunk clang`);
    await exec(`svn co --non-interactive --trust-server-cert http://llvm.org/svn/llvm-project/cfe/trunk clang`);
    await exec(`mkdir -p ${llvmBuildDir}`);
    process.chdir(llvmBuildDir);
    await exec(`cmake -G "Unix Makefiles" -DCMAKE_INSTALL_PREFIX=${llvmDir} -DLLVM_TARGETS_TO_BUILD= -DLLVM_EXPERIMENTAL_TARGETS_TO_BUILD=WebAssembly ${llvmDir}/llvm`);
    await exec(`make -j 4`);
    await exec(`make install`, {stdin: process.stdin});
}

async function checkCMake() {
    const cmake = await tryDep(`cmake`, `--version`);
    if (cmake) {
        const version = cmake.stdout.match(/cmake version ([^\s]+)/)[1].split(".").map(Number);
        const tooLowVersion = (version[0] < 3) || (version[0] === 3 && version[1] < 5);
        if (tooLowVersion) {
            throw new Error(`cmake version 3.5.0+ required, found ${version.join(".")}`);
        }
    } else {
        throw new Error("cmake is not installed");
    }
}

(async () => {

let [wasmAs,
       s2wasm,
       wasmOpt,
       llc,
       clang] = await Promise.all([
            exists(`${binaryenBuildDir}/bin/wasm-as`),
            exists(`${binaryenBuildDir}/bin/s2wasm`),
            exists(`${binaryenBuildDir}/bin/wasm-opt`),
            exists(`${llvmBuildDir}/bin/llc`),
            exists(`${llvmBuildDir}/bin/clang`)]);

if (!wasmAs || !s2wasm || !wasmOpt) {
    await checkCMake();
    await installBinaryen();
}

if (!llc || !clang) {
    await checkCMake();
    await installLlvm();
}

([wasmAs,
       s2wasm,
       wasmOpt,
       llc,
       clang] = await Promise.all([
            exists(`${binaryenBuildDir}/bin/wasm-as`),
            exists(`${binaryenBuildDir}/bin/s2wasm`),
            exists(`${binaryenBuildDir}/bin/wasm-opt`),
            exists(`${llvmBuildDir}/bin/llc`),
            exists(`${llvmBuildDir}/bin/clang`)]));

process.chdir(projectDir);

const targetDir = WORKER ? "dist/worker" : "dist";

await exec("mkdir -p build");
await exec("mkdir -p wasm");
await exec(`mkdir -p ${targetDir}/wasm`);

const source = `${ENTRY}`;
const bcfile = `build/${ENTRY_FILE_NAME}.bc`;
const sfile = `build/${ENTRY_FILE_NAME}.s`;
const wastfile = `build/${ENTRY_FILE_NAME}.wast`;
const symbolFile = `build/${ENTRY_FILE_NAME}.sym`;
const wasmfile = `wasm/${ENTRY_FILE_NAME}`;
const wasmFileFullName = RELEASE ? `${wasmfile}.release.wasm` : `${wasmfile}.debug.wasm`;
// Oz, O2, O3 are bugged with wasm backend
const oLevelClang = RELEASE ? `-O1` : `-O0`;
const dDebug = RELEASE ? "0" : "1";
const sourceMapFile = `build/${ENTRY_FILE_NAME}.sm`;
const sourceMapUrl = `/${targetDir}/wasm/${ENTRY_FILE_NAME}.sm`;
const clangFlags = `${RELEASE ? "-Werror" : ""}`;

await exec(`${clang} -std=c11 -nostdinc -nostdlib ${clangFlags} -Wall -Inative/third-party -Inative/lib -Inative/lib/include -DDEBUG=${dDebug} -DSTACK_SIZE=${STACK_SIZE} -emit-llvm --target=wasm32 ${oLevelClang} "${source}" -c -o "${bcfile}"`, {doErr: true, doOut: true});
await exec(`${llc} -march=wasm32 -thread-model=single -data-sections -function-sections -asm-verbose=false -o "${sfile}" "${bcfile}"`, {doErr: true})
await exec(`${s2wasm} -i ${INITIAL_MEMORY} -s ${STACK_SIZE} -o ${wastfile} ${sfile}`, {doErr: true})
if (RELEASE) {
    await exec(`${wasmOpt} -Oz -o ${wasmFileFullName} ${wastfile}`, {doErr: true});
} else {
    await exec(`${wasmAs} -g -su "${sourceMapUrl}" -sm ${sourceMapFile} -s ${symbolFile} -o ${wasmFileFullName} ${wastfile}`, {doErr: true});
}

await exec(`cp ${wasmFileFullName} ${targetDir}/wasm/`);
await exec(`cp ${sourceMapFile} ${targetDir}/wasm/${ENTRY_FILE_NAME}.sm`);

})().catch(e => {
    console.error(e.message);
    if (e.stderr) {
        console.error(e.stderr);
    }
    process.exit(1);
});

