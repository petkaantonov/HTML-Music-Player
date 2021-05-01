import cp, {StdioNull, StdioPipe} from "child_process";
import {tmpdir} from "os"
import fs from "fs/promises"

interface Options {
    doOut?: boolean
    doErr?: boolean
    responseTimeout?: number
    stdin?: StdioNull | StdioPipe | NodeJS.ReadStream
}
const exec = (cmd: string, { doOut = true, doErr = false, stdin = "pipe" as const, responseTimeout = undefined}: Options = {}): Promise<string> => {
    let selfTerm = false;
    const name = cmd.split(" ")[0];
    const logFile = `${tmpdir}exec.${Math.random()}.log`
    return new Promise((resolve, reject) => {
        const ee = cp.spawn("sh", ["-c", `${cmd} 2>&1 | tee ${logFile}` ], {
            stdio: [stdin, process.stdout, process.stderr]
        });
        const stderr = [];
        const stdout = [];

        const getOutput = async () => {
            return await fs.readFile(logFile, "utf-8")
        };



        ee.on(`error`, async () => {
            reject(Object.assign(new Error(`failed to execute ${cmd}`), await getOutput()));
            await fs.unlink(logFile)
        });

        ee.on(`exit`, async (code, signal) => {
            const out = await getOutput();
            await fs.unlink(logFile)
            if (code === 0) {
                resolve(out);
            } else if (typeof code === `number`) {
                if (out.indexOf(`${name}: not found`) >= 0) {
                    reject(Object.assign(new Error(`${name} is not installed, exiting`), out));
                } else {
                    reject(Object.assign(new Error(`\`${cmd}\` gave non-zero exit code: ${code} `), out));
                }
            } else if (signal === `SIGTERM` && selfTerm) {
                reject(Object.assign(new Error(`\`${cmd}\` timed out with no response within ${responseTimeout / 1000 | 0} seconds`), out));
            } else {
                resolve(out);
            }
        });

        if (responseTimeout !== undefined) {
            setTimeout(() => {
                if (!stdout.length && !stderr.length) {
                    selfTerm = true;
                    ee.kill(`SIGTERM`);
                }
            }, responseTimeout);
        }
    });
};

export default exec;

