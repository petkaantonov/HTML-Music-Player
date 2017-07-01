/* globals self: false, window: false, document: false, cssLoaded: false, CSS_LOAD_START: false */
import {console, performance} from "platform/platform";
import Application from "Application";
import {setDepChecking, default as withDeps} from "ApplicationDependencies";
import KeyValueDatabase from "platform/KeyValueDatabase";
import Env from "platform/Env";
import GlobalEvents from "platform/GlobalEvents";
import Page from "platform/dom/Page";
import {noop, setIsDevelopment} from "util";

const defaultTitle = `Soita`;

const TOO_LONG_TO_LOAD_MS = 300;

try {
    Object.defineProperty(self, `Promise`, {
        value: Promise,
        writable: false, configurable: false, enumerable: false
    });
} catch (e) {
    // Empty
}

const desc = {
    value: noop,
    writable: false,
    configurable: false
};
try {
    Object.defineProperties(self, {
        alert: desc,
        prompt: desc,
        confirm: desc
    });
} catch (e) {
    // NOOP;
}

if (typeof console === `undefined` || !console) {
    window.console = {log: noop, error: noop, warn: noop};
}

const page = new Page(document, window);
const ready = page.ready();
const db = new KeyValueDatabase();
const dbValuesPromise = db.getInitialValues();
const env = new Env(page);
const globalEvents = new GlobalEvents(page);
const featureCheckResultsPromise = env.getRequiredPlatformFeatures();
const loadingIndicatorShowerTimeoutId = setTimeout(() => {
    page.$(`.loader-container`)
            .show("inline-block")
            .forceReflow()
            .removeClass(`initial`)
            .forceReflow();
}, TOO_LONG_TO_LOAD_MS);

setDepChecking(env.isDevelopment());
setIsDevelopment(env.isDevelopment());

page.setTitle(defaultTitle);
page.window().onerror = function(a, b, c, d, e) {
    const date = new Date().toISOString();
    if (env.isDevelopment()) {
        if (e && e.stack) {
            console.log(date, e.stack);
        } else {
            const msg = `${a} ${b}:${c}:${d}`;
            console.log(date, msg);
        }
    } else {
        if (e && e.stack) {
            console.log(date, e.stack);
        } else {
            const msg = `${a} ${b}:${c}:${d}`;
            console.log(date, msg);
        }
    }
};

(async () => {
    await cssLoaded(Promise);
    console.log(`css load time:`, performance.now() - CSS_LOAD_START, `ms`);
    const [featureCheckResults] = await Promise.all([featureCheckResultsPromise, ready]);
    const featureMissing = featureCheckResults.some(v => !v.supported);
    if (featureMissing) {
        clearTimeout(loadingIndicatorShowerTimeoutId);
        page.$(`#app-load-text`).remove();
        page.$(`#app-loader .missing-features`).removeClass(`no-display`);

        featureCheckResults.forEach((v) => {
            if (!v.supported) {
                const link = page.createElement(`a`, {
                    target: `_blank`,
                    class: `link-text`,
                    href: v.canIUseUrl
                }).setText(v.apiName);

                const children = [
                    page.createElement(`span`).setText(v.description),
                    page.createElement(`sup`).append(link)
                ];

                page.createElement(`li`, {class: `missing-feature-list-item`}).
                    append(children).
                    appendTo(page.$(`#app-loader .missing-features .missing-feature-list`));
            }
        });

        throw new Error(`missing features`);
    } else {
        page.$(`#app-container`).show();
    }

    if (globalEvents.isWindowBackgrounded()) {
        await globalEvents.windowWasForegrounded();
    }
    const dbValues = await dbValuesPromise;

    self.soitaApp = withDeps({
        env,
        db,
        dbValues: Object(dbValues),
        defaultTitle,
        globalEvents,
        page
    }, deps => new Application(deps, loadingIndicatorShowerTimeoutId));
})();

