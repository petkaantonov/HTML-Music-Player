"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird");
require("../lib/ua-parser");

var features = module.exports;
var input = document.createElement("input");

features.allowMimes = ["audio/mp3", "audio/mpeg"];
features.allowExtensions = "mp3,mpg,mpeg".split(",");

features.readFiles = typeof FileReader == "function" && new FileReader()
    .readAsBinaryString;
features.directories = ("webkitdirectory" in input ||
    "directory" in input ||
    "mozdirectory" in input);
features.touch = (('ontouchstart' in window) ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0 ||
    (window.DocumentTouch && (document instanceof window.DocumentTouch)));

if (!features.touch) {
    $("body").addClass("no-touch");
}

var browserName, browserVersion;
var isIe = false;
if ($.ua.browser) {
    browserName = ($.ua.browser.name || "").toLowerCase();
    browserVersion = +($.ua.browser.major || 0);
}

if ($.ua.engine && $.ua.engine.name && $.ua.engine.name.toLowerCase().indexOf("trident") >= 0) {
    isIe = true;
}

features.requiredFeatures = {
    "Audio playback capability": [Promise.method(function() {
        try {
            return !!(AudioContext || webkitAudioContext);
        } catch (e) {
            return false;
        }
    }), "http://caniuse.com/#feat=audio-api", "Web Audio API"],

    "Database capability": [Promise.method(function() {
        try {
            if ((browserName === "edge" && browserVersion < 14) || browserName === "safari" || isIe) {
                return false;
            }
            return !!indexedDB && typeof indexedDB.open === "function";
        } catch (e) {
            return false;
        }
    }), "http://caniuse.com/#feat=indexeddb", "IndexedDB API"],

    "File reading capability": [Promise.method(function() {
        try {
            var ret = typeof File.prototype.slice === "function" &&
                      typeof Blob.prototype.slice === "function";
            var b = new Blob([], {type: "text/json"});
            return ret && b.size === 0 && b.type === "text/json";
        } catch (e) {
            return false;
        }
    }), "http://caniuse.com/#feat=fileapi", "File API"],

    "Multi-core utilization capability": [Promise.method(function() {
        if (browserName === "safari" || isIe) {
            return false;
        }
        var worker, url;
        return new Promise(function(resolve, reject) {
            var code = "var abc;";
            var blob = new Blob([code], {type: "application/javascript"});
            url = URL.createObjectURL(blob);
            worker = new Worker(url);
            // IE10 supports only 1 transferable and this must not be counted as
            // supporting the feature.
            var buffers = [
                new Uint8Array([0xFF]),
                new Uint8Array([0xFF])
            ];
            var transferList = buffers.map(function(v) {return v.buffer});
            worker.postMessage({
                transferList: transferList
            }, transferList);

            var buffersAreNeutered = buffers.filter(function(v) {
                return v.buffer.byteLength === 0;
            }).length === 2;
            resolve(buffersAreNeutered);
        }).timeout(2500).finally(function() {
            if (url) URL.revokeObjectURL(url);
            if (worker) worker.terminate();
        });
    }), "http://caniuse.com/#feat=webworkers", "Web Worker API"]
};
