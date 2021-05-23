import KeyValueDatabase from "shared/src/idb/KeyValueDatabase";
import { setIsDevelopment, setTimers } from "shared/util";
import Application from "ui/Application";
import Page from "ui/platform/dom/Page";
import Env from "ui/platform/Env";
import GlobalEvents from "ui/platform/GlobalEvents";
import ServiceWorkerManager from "ui/platform/ServiceWorkerManager";

declare let cssLoaded: {
    (p: PromiseConstructor): Promise<void>;
};
declare let CSS_LOAD_START: number;
declare global {
    const uiLog: (...args: string[]) => void;
}

(window as any).fromFrames = function (f: number) {
    const secs = f / 48000;
    const mins = Math.floor(secs / 60);
    const secs2 = secs % 60;
    return `${mins}:${secs2}`;
};

const defaultTitle = `Soita`;
const TOO_LONG_TO_LOAD_MS = 300;
const timers = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
};
setTimers(timers);
const page = new Page(document, window, timers);
const ready = page.ready();
const globalEvents = new GlobalEvents(page);
const db = new KeyValueDatabase(uiLog);
const env = new Env(page);
const serviceWorkerManager = new ServiceWorkerManager({
    env,
    page,
    globalEvents,
    db,
});
serviceWorkerManager.start();
const featureCheckResultsPromise = env.getRequiredPlatformFeatures();
const loadingIndicatorShowerTimeoutId = page.setTimeout(() => {
    page.$(`.loader-container`).show(`inline-block`).forceReflow().removeClass(`initial`).forceReflow();
}, TOO_LONG_TO_LOAD_MS);

setIsDevelopment(env.isDevelopment());
page.setTitle(defaultTitle);

void (async () => {
    await cssLoaded(Promise);
    // eslint-disable-next-line no-console
    console.log(`css load time:`, performance.now() - CSS_LOAD_START, `ms`);
    const [featureCheckResults] = await Promise.all([featureCheckResultsPromise, ready]);
    const featureMissing = featureCheckResults.some(v => !v.supported);

    if (featureMissing) {
        page.clearTimeout(loadingIndicatorShowerTimeoutId);
        page.$(`#app-load-text`).remove();
        page.$(`#app-loader .missing-features`).removeClass(`no-display`);

        featureCheckResults.forEach(v => {
            if (!v.supported) {
                const link = page
                    .createElement(`a`, {
                        target: `_blank`,
                        class: `link-text`,
                        href: v.canIUseUrl,
                    })
                    .setText(v.apiName);

                const children = [
                    page.createElement(`span`).setText(v.description),
                    page.createElement(`sup`).append(link),
                ];

                page.createElement(`li`, { class: `missing-feature-list-item` })
                    .append(children)
                    .appendTo(page.$(`#app-loader .missing-features .missing-feature-list`));
            }
        });

        throw new Error(`missing features`);
    } else {
        page.$(`.js-app-container`).show(`grid`);
    }

    const dbValues = await serviceWorkerManager.loadPreferences();

    if (globalEvents.isWindowBackgrounded()) {
        await globalEvents.windowWasForegrounded();
    }

    (self as any).soitaApp = new Application(
        {
            env,
            db,
            dbValues: Object(dbValues),
            defaultTitle,
            globalEvents,
            page,
            timers,
            serviceWorkerManager,
        },
        loadingIndicatorShowerTimeoutId
    );
})();
