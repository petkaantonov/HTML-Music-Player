"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird");

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
        var worker, url;
        return new Promise(function(resolve, reject) {
            var code = "self.onmessage = function(e) {self.postMessage({transferList: e.data.transferList}, e.data.transferList);};";
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
            worker.addEventListener("error", reject, false);
            worker.addEventListener("message", function(event) {
                try {
                    var tList = event.data.transferList.map(function(v) {
                        return new Uint8Array(v);
                    }).filter(function(v) {
                        return v[0] === 0xFF;
                    });
                    var originalBuffersWereNeutered = buffers.filter(function(v) {
                        return v.buffer.byteLength === 0;
                    }).length === 2;
                    resolve(tList.length === 2);
                } catch (e) {
                    resolve(false);
                }
            }, false);
        }).timeout(2500).finally(function() {
            if (url) URL.revokeObjectURL(url);
            if (worker) worker.terminate();
        });
    }), "http://caniuse.com/#feat=webworkers", "Web Worker API"]
};
