const cp = require("child_process");

const exec = function(cmd, {
    doOut=true,
    doErr=false,
    responseTimeout=false,
    stdin="pipe"
} = {}) {
    const name = cmd.split(" ")[0];
    let selfTerm = false;
    return new Promise((resolve, reject) => {
        const ee = cp.exec(cmd, {
            stdio: [stdin, "pipe", "pipe"]
        });
        const stderr = [];
        const stdout = [];

        const getOutput = () => {
            return {
                stderr: stderr.join(""),
                stdout: stdout.join("")
            };
        };

        ee.stdout.on("data", data => {
            if (doOut) {
                process.stdout.write(data + "");
            }
            stdout.push(data + "");
        });
        ee.stderr.on("data", data => {
            if (doErr) {
                process.stderr.write(data + "");
            }
            stderr.push(data + "");
        });

        ee.on("error", function() {
            reject(Object.assign(new Error(`failed to execute ${cmd}`), getOutput()));
        });

        ee.on("exit", function(code, signal) {
            const out = getOutput();
            if (code === 0) {
                resolve(out);
            } else if (typeof code === "number") {
                if (out.stderr.indexOf(`${name}: not found`) >= 0) {
                    reject(Object.assign(new Error(`${name} is not installed, exiting`), out));
                } else {
                    reject(Object.assign(new Error(`\`${cmd}\` gave non-zero exit code: ${code} `), out));
                }
            } else if (signal === "SIGTERM" && selfTerm) {
                reject(Object.assign(new Error(`\`${cmd}\` timed out with no response within ${responseTimeout/1000|0} seconds`), out));
            } else {
                resolve(out);
            }
        });

        if (responseTimeout !== false) {
            setTimeout(() => {
                if (!stdout.length && !stderr.length) {
                    selfTerm = true;
                    ee.kill("SIGTERM");
                }
            }, responseTimeout);
        }
    })
};

module.exports = exec;
