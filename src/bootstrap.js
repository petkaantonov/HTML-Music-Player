/* globals self: false, window: false, document: false, cssLoaded: false, CSS_LOAD_START: false */
"use strict";

import { console } from "platform/platform";
import Promise from "platform/PromiseExtensions";
import Application from "Application";
import ApplicationDependencies from "ApplicationDependencies";
import KeyValueDatabase from "platform/KeyValueDatabase";
import Env from "platform/Env";
import GlobalEvents from "platform/GlobalEvents";
import Page from "platform/dom/Page";

const defaultTitle = "Soita";

try {
    Object.defineProperty(self, "Promise", {
        value: Promise,
        writable: false, configurable: false, enumerable: false
    });
} catch (e) {}

if (typeof console === "undefined" || !console) {
    window.console = {log: function() {}};
}

var page = new Page(document, window);
var ready = page.ready();
var db = new KeyValueDatabase();
var dbValues = db.getInitialValues();
var env = new Env(page);
var globalEvents = new GlobalEvents(page);
var featureCheckResults = env.getRequiredPlatformFeatures();

cssLoaded(Promise).then(function() {
    console.log("css load time:", Date.now() - CSS_LOAD_START, "ms");
    return Promise.all([featureCheckResults, ready]).return(featureCheckResults);
}).then(function(featureCheckResults) {
    var featureMissing = featureCheckResults.some(function(v) {return !v.supported;});

    if (featureMissing) {
        page.$("#app-load-text").remove();
        page.$("#app-loader .missing-features").removeClass("no-display");

        featureCheckResults.forEach(function(v) {
            if (!v.supported) {
                var link = page.createElement("a", {
                    target: "_blank",
                    class: "link-text",
                    href: v.canIUseUrl
                }).setText(v.apiName);

                var children = [
                    page.createElement("span").setText(v.description),
                    page.createElement("sup").append(link)
                ];

                page.createElement("li", {class: "missing-feature-list-item"})
                    .append(children)
                    .appendTo(page.$("#app-loader .missing-features .missing-feature-list"));
            }
        });

        throw new Error("missing features");
    } else {
        page.$("#app-loader").remove();
        page.$("#app-container").show();
    }

    var foregrounded = Promise.resolve();
    if (globalEvents.isWindowBackgrounded()) {
        foregrounded = new Promise(function(resolve) { globalEvents.once("foreground", resolve); });
    }

    return foregrounded.return(dbValues);
}).then(function(dbValues) {
    self.soitaApp = new Application(new ApplicationDependencies({
        env: env,
        db: db,
        dbValues: dbValues,
        defaultTitle: defaultTitle,
        globalEvents: globalEvents,
        page: page
    }));
});

var desc = {
    value: function() {},
    writable: false,
    configurable: false
};
try {
    Object.defineProperties(self, {
        alert: desc,
        prompt: desc,
        confirm: desc
    });
} catch (e) {}

page.setTitle(defaultTitle);
page.window().onerror = function(a, b, c, d, e) {
    var date = new Date().toISOString();
    if (env.isDevelopment()) {
        if (e && e.stack) {
            console.log(date, e.stack);
        } else {
            var msg = a + " " + b + ":" + c + ":" + d;
            console.log(date, msg);
        }
    } else {
        if (e && e.stack) {
            console.log(date, e.stack);
        } else {
            var msg = a + " " + b + ":" + c + ":" + d;
            console.log(date, msg);
        }
    }
};
