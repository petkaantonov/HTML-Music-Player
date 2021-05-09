/* eslint-disable no-console */
import fs from "fs";
import minimist from "minimist";
import { homedir } from "os";
import Path from "path";

import exec from "./exec";

const projectDir = Path.dirname(__dirname);
const exists = (path: string) => {
    return new Promise(resolve => {
        fs.exists(path, yesno => resolve(yesno ? path : false));
    });
};

const PAGE_SIZE = 65536;
const argv = minimist(process.argv.slice(2), { string: "name" });
const RELEASE = argv.release;
const STACK_SIZE = +(argv.stackSize || argv.s) || 128 * 1024;
const INITIAL_MEMORY = Math.ceil((+(argv.initialMemory || argv.i) || STACK_SIZE * 50) / PAGE_SIZE) * PAGE_SIZE;
const ENTRY = argv._[0] || "native/main.c";
const ENTRY_FILE_NAME = argv.name ? argv.name : Path.basename(ENTRY, Path.extname(ENTRY));
const root = homedir();
const binaryenDir = `${root}/binaryen`;
const binaryenBuildDir = `${binaryenDir}/build`;
const llvmDir = `${root}/llvmwasm`;
const llvmBuildDir = `${llvmDir}/build`;

function tryDep(name: string): Promise<boolean>;
function tryDep(name: string, versionCall: string): Promise<string>;
async function tryDep(name: string, versionCall?: string) {
    try {
        await exec(`which ${name}`, { doOut: false });
        if (versionCall) {
            return exec(`${name} ${versionCall}`, { doOut: false });
        } else {
            return true;
        }
    } catch (e) {
        return false;
    }
}

async function installBinaryen() {
    console.log(`Installing binaryen to ${binaryenDir}`);

    await exec(`mkdir -p ${binaryenDir}`);
    process.chdir(binaryenDir);

    const clone = await exec(`git clone --depth=1 https://github.com/WebAssembly/binaryen.git ${binaryenDir}`);
    if (clone.includes("already exists and is not an empty directory")) {
        await exec("git init", { doOut: false });
        await exec("git remote add origin https://github.com/WebAssembly/binaryen.git", { doOut: false });
        await exec("git fetch --depth=1");
        await exec("git checkout origin/main", { doOut: false });
        await exec("git branch -D main", { doOut: false });
        await exec("git checkout -b main origin/main", { doOut: false });
    }

    await exec(`mkdir -p ${binaryenBuildDir}`);
    process.chdir(binaryenBuildDir);
    await exec(
        `cmake -G "Unix Makefiles" -DCMAKE_INSTALL_PREFIX=${binaryenDir} -DCMAKE_BUILD_TYPE=Release ${binaryenDir}`
    );
    await exec(`make -C ${binaryenBuildDir} -j 8 wasm-as wasm-opt`);
}

async function installLlvm() {
    console.log(`Installing llvm to ${llvmDir}`);
    await exec(`mkdir -p ${llvmDir}/build`);
    process.chdir(llvmDir);

    const clone = await exec(`git clone --depth=1 https://github.com/llvm/llvm-project.git ${llvmDir}`);

    if (clone.includes("already exists and is not an empty directory")) {
        await exec("git init", { doOut: false });
        await exec("git remote add origin https://github.com/llvm/llvm-project.git", { doOut: false });
        await exec("git fetch --depth=1 origin main");
        await exec("git checkout origin/main", { doOut: false });
        await exec("git branch -D main", { doOut: false });
        await exec("git checkout -b main origin/main", { doOut: false });
    }
    process.chdir(llvmBuildDir);
    await exec(
        `cmake -G "Unix Makefiles" -DCMAKE_INSTALL_PREFIX=${llvmDir} -DLLVM_TARGETS_TO_BUILD=WebAssembly -DLLVM_ENABLE_PROJECTS="clang;clang-tools-extra;lld" ${llvmDir}/llvm`
    );
    await exec(`make -j 8`);
    await exec(`make install`, { stdin: process.stdin });
}

async function checkCMake() {
    const cmake = await tryDep(`cmake`, `--version`);
    if (cmake) {
        const version = cmake
            .match(/cmake version ([^\s]+)/)![1]!
            .split(".")
            .map(Number);
        const tooLowVersion = version[0] < 3 || (version[0] === 3 && version[1] < 5);
        if (tooLowVersion) {
            throw new Error(`cmake version 3.5.0+ required, found ${version.join(".")}`);
        }
    } else {
        throw new Error("cmake is not installed");
    }
}

(async () => {
    let [wasmAs, wasmOpt, llc, wasmld, clang] = await Promise.all([
        exists(`${binaryenBuildDir}/bin/wasm-as`),
        exists(`${binaryenBuildDir}/bin/wasm-opt`),
        exists(`${llvmBuildDir}/bin/llc`),
        exists(`${llvmBuildDir}/bin/wasm-ld`),
        exists(`${llvmBuildDir}/bin/clang`),
    ]);

    if (!wasmAs || !wasmOpt) {
        await checkCMake();
        await installBinaryen();
    }

    if (!llc || !wasmld || !clang) {
        await checkCMake();
        await installLlvm();
    }

    [wasmAs, wasmOpt, llc, wasmld, clang] = await Promise.all([
        exists(`${binaryenBuildDir}/bin/wasm-as`),
        exists(`${binaryenBuildDir}/bin/wasm-opt`),
        exists(`${llvmBuildDir}/bin/llc`),
        exists(`${llvmBuildDir}/bin/wasm-ld`),
        exists(`${llvmBuildDir}/bin/clang`),
    ]);

    process.chdir(projectDir);

    const targetDir = "ui";

    await exec("mkdir -p build");
    await exec("mkdir -p wasm");
    await exec(`mkdir -p ${targetDir}/wasm`);

    const source = `${ENTRY}`;
    const bcfile = `build/${ENTRY_FILE_NAME}.bc`;
    const ofile = `build/${ENTRY_FILE_NAME}.o`;
    const wasmfile = `ui/wasm/${
        RELEASE ? `${ENTRY_FILE_NAME}.production.wasm` : `${ENTRY_FILE_NAME}.development.wasm`
    }`;
    const oLevelClang = RELEASE ? `-O3` : `-O0`;
    const dDebug = RELEASE ? "0" : "1";
    // const sourceMapFile = `build/${ENTRY_FILE_NAME}.sm`;
    // const sourceMapUrl = `/dist/wasm/${ENTRY_FILE_NAME}.sm`;
    const clangFlags = `${RELEASE ? "" : ""}`;

    await exec(
        `${clang} -std=c11 --no-standard-libraries -nostdlib++ -nostdinc -nostdlib ${clangFlags} -fvisibility=hidden -Wall -Inative/third-party -Inative/lib -Inative/lib/include -DDEBUG=${dDebug} -DSTACK_SIZE=${STACK_SIZE} -emit-llvm --target=wasm32 ${oLevelClang} "${source}" -c -o "${bcfile}"`,
        { doErr: true, doOut: true }
    );
    await exec(`${llc} ${RELEASE ? "-O3" : ""} -filetype=obj -o "${ofile}" "${bcfile}"`);
    await exec(
        `${wasmld} --unresolved-symbols=import-functions -z stack-size=${STACK_SIZE} --export-dynamic --initial-memory=${INITIAL_MEMORY} -o ${wasmfile} ${ofile}`
    );

    if (RELEASE) {
        await exec(`${wasmOpt} -Oz -o ${wasmfile} ${wasmfile}`);
    }
})().catch(e => {
    console.error(e.message);
    if (e.stderr) {
        console.error(e.stderr);
    }
    process.exit(1);
});
