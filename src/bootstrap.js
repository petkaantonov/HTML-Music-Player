"use strict";

import $ from "jquery";
import Promise from "bluebird";
import Application from "Application";
import KeyValueDatabase from "platform/KeyValueDatabase";
import Env from "platform/Env";
import GlobalEvents from "platform/GlobalEvents";

const defaultTitle = "Soita";

if (typeof console === "undefined" || !console) {
    window.console = {log: function() {}};
}

Promise.config({
    warnings: false,
    longStackTraces: false,
    cancellation: true
});

var ready = new Promise(function(resolve) { $(resolve); });
var db = new KeyValueDatabase();
var dbValues = db.getInitialValues();
var env = new Env();
var globalEvents = new GlobalEvents();
var featureCheckResults = env.getRequiredPlatformFeatures();

cssLoaded(Promise).then(function() {
    console.log("css load time:", Date.now() - CSS_LOAD_START, "ms");
    return Promise.all([featureCheckResults, ready]).return(featureCheckResults);
}).then(function(featureCheckResults) {
    var featureMissing = featureCheckResults.some(function(v) {return !v.supported;});

    if (featureMissing) {
        $("#app-load-text").remove();
        $("#app-loader .missing-features").removeClass("no-display");

        featureCheckResults.forEach(function(v) {
            if (!v.supported) {
                var link = $("<a>", {
                    target: "_blank",
                    class: "link-text",
                    href: v.canIUseUrl
                }).text(v.apiName);

                var children = [
                    $("<span>").text(v.description),
                    $("<sup>").append(link)
                ];

                $("<li>", {class: "missing-feature-list-item"})
                    .append(children)
                    .appendTo($("#app-loader .missing-features .missing-feature-list"));
            }
        });

        throw new Error("missing features");
    } else {
        $("#app-loader").remove();
        $("#app-container").show();
    }

    var foregrounded = Promise.resolve();
    if (globalEvents.isWindowBackgrounded()) {
        foregrounded = new Promise(function(resolve) { globalEvents.once("foreground", resolve); });
    }

    return foregrounded.return(dbValues);
}).then(function(dbValues) {
    self.soitaApp = new Application({
        env: env,
        db: db,
        dbValues: dbValues,
        defaultTitle: defaultTitle,
        globalEvents: globalEvents
    });
});

var desc = {
    value: function() {},
    writable: false,
    configurable: false
};
try {
    Object.defineProperties(window, {
        alert: desc,
        prompt: desc,
        confirm: desc
    });
} catch (e) {}


document.title = defaultTitle;

window.onerror = function(a, b, c, d, e) {
    var date = new Date().toISOString();
    if (window.DEBUGGING) {
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
