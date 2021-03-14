import cp, {StdioNull, StdioPipe} from "child_process";


interface Result {
    stdout: string
    stderr: string
}

interface Options {
    doOut?: boolean
    doErr?: boolean
    responseTimeout?: number
    stdin?: StdioNull | StdioPipe
}

const exec = (cmd: string, { doOut = true, doErr = false, stdin = "pipe" as const, responseTimeout = undefined} = {}): Promise<Result> => {
    const [name, ...args] = cmd.split(/\s+/g);
    let selfTerm = false;
    return new Promise((resolve, reject) => {
        const ee = cp.spawn(name, args, {
            stdio: [stdin, `pipe` as const, `pipe` as const]
        });
        const stderr = [];
        const stdout = [];

        const getOutput = () => ({
                stderr: stderr.join(``),
                stdout: stdout.join(``)
            });

        ee.stdout.on(`data`, (data) => {
            if (doOut) {
                process.stdout.write(`${data}`);
            }
            stdout.push(`${data}`);
        });
        ee.stderr.on(`data`, (data) => {
            if (doErr) {
                process.stderr.write(`${data}`);
            }
            stderr.push(`${data}`);
        });

        ee.on(`error`, () => {
            reject(Object.assign(new Error(`failed to execute ${cmd}`), getOutput()));
        });

        ee.on(`exit`, (code, signal) => {
            const out = getOutput();
            if (code === 0) {
                resolve(out);
            } else if (typeof code === `number`) {
                if (out.stderr.indexOf(`${name}: not found`) >= 0) {
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

