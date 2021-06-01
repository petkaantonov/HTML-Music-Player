const enabledSystems: Record<string, string[]> = {};
let configured: boolean = false;

export function setDebugConfig(config: Record<string, string | string[]>, workers?: Worker[]) {
    configured = true;
    for (const [system, labels] of Object.entries(config)) {
        enabledSystems[system] = typeof labels === "string" ? [labels] : labels;
    }
    if (workers && workers.length) {
        for (const worker of workers) {
            worker.postMessage({
                type: "debugConfig",
                value: enabledSystems,
            });
        }
    }
}

function debug(system: string, label: string, args: any[]) {
    if (configured) {
        if (!enabledSystems[system]) {
            return;
        }
        const labels = enabledSystems[system];
        let found = false;
        for (const enabledLabel of labels) {
            if (enabledLabel.startsWith("!") && enabledLabel.indexOf(label) === 1) {
                return;
            }
            if (enabledLabel === "*" || enabledLabel === label) {
                found = true;
            }
        }
        if (!found) {
            return;
        }
    }
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });

    console.log(`[${time}:${system}:${label}]`, ...args);
}

export function debugFor(system: string) {
    return (label: string, ...args: any[]) => {
        debug(system, label, args);
    };
}
