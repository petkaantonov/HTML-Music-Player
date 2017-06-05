"use strict";

import { AudioContext, webkitAudioContext, indexedDB, File, Blob, URL, Worker, Uint8Array } from "platform/platform";
import parser from "ua-parser-js";

export default function Env(page) {
    var document = page.document();
    var navigator = page.navigator();
    var window = page.window();

    var input = document.createElement("input");
    const desktopOs = /^(CentOS|Fedora|FreeBSD|Debian|Gentoo|GNU|Linux|Mac OS|Minix|Mint|NetBSD|OpenBSD|PCLinuxOS|RedHat|Solaris|SUSE|Ubuntu|UNIX VectorLinux|Windows)$/;
    var ua = parser(navigator.userAgent);
    var isDesktop = false;

    if (ua.device && ua.device.type) {
        isDesktop = !/^(console|mobile|tablet|smarttv|wearable|embedded)$/.test(ua.device.type);
    } else if (ua.cpu && ua.cpu.architecture) {
        isDesktop = /^(amd64|ia32|ia64)$/.test(ua.cpu.architecture);
    } else if (ua.os && ua.os.name) {
        isDesktop = desktopOs.test(ua.os.name);
    }
    this._isDesktop = isDesktop;
    this._touch = (('ontouchstart' in window) ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0 ||
        (window.DocumentTouch && (document instanceof window.DocumentTouch)));

    this._directories = ("webkitdirectory" in input ||
                        "directory" in input ||
                        "mozdirectory" in input);
    this._readFiles = typeof window.FileReader === "function";

    this._supportedMimes = "audio/mp3,audio/mpeg".split(",");
    this._rSupportedMimes = new RegExp("^(?:"+this._supportedMimes.join("|")+")$", "i");
    this._rSupportedExtensions = /^(?:mp3|mpg|mpeg)$/i;
    this._mediaSession = "mediaSession" in navigator;

    var browserName, browserVersion;
    var isIe = false;
    if (ua.browser) {
        browserName = (ua.browser.name || "").toLowerCase();
        browserVersion = +(ua.browser.major || 0);
    }

    if (ua.engine && ua.engine.name && ua.engine.name.toLowerCase().indexOf("trident") >= 0) {
        isIe = true;
    }

    this._isIe = isIe;
    this._isSafari = browserName === "safari";
    this._browserName = browserName;
    this._browserVersion = browserVersion;
    this._retChecked = false;
    this._isDevelopment = window.DEBUGGING === true;

    this._maxNotificationActions = 0;

    if (typeof window.Notification === "function" &&
        typeof window.Notification.maxActions === "number" &&
        typeof navigator.serviceWorker !== "undefined") {
        this._maxNotificationActions = window.Notification.maxActions;
    }
}

Env.prototype.mediaSessionSupport = function() {
    return this._mediaSession;
};

Env.prototype.maxNotificationActions = function() {
    return this._maxNotificationActions;
};

Env.prototype.isDevelopment = function() {
    return this._isDevelopment;
};

Env.prototype.isProduction = function() {
    return !this._isDevelopment;
};

Env.prototype.hasTouch = function() {
    return this._touch;
};

Env.prototype.isDesktop = function() {
    return this._isDesktop;
};

Env.prototype.isMobile = function() {
    return !this._isDesktop;
};

Env.prototype.supportsDirectories = function() {
    return this._directories;
};

Env.prototype.canReadFiles = function() {
    return this._readFiles;
};

Env.prototype.supportsExtension = function(ext) {
    return this._rSupportedExtensions.test(ext);
};

Env.prototype.supportsMime = function(mime) {
    return this._rSupportedMimes.test(mime);
};

Env.prototype.supportedMimes = function() {
    return this._supportedMimes.slice();
};

Env.prototype.logError = function(e) {
    if (this.isDevelopment()) {
        this.window.console.error(e && (e.stack || e.message) ? `${(e.stack || e.message)}` : e);
    }
};

Env.prototype.getRequiredPlatformFeatures = function() {
    if (this._retChecked) return Promise.reject(new Error("already called"));
    this._retChecked = true;
    var self = this;
    var ret = {
        "Audio playback capability": [Promise.method(function() {
            try {
                return !!(AudioContext || webkitAudioContext);
            } catch (e) {
                return false;
            }
        }), "http://caniuse.com/#feat=audio-api", "Web Audio API"],

        "Database capability": [Promise.method(function() {
            try {
                if ((self._browserName === "edge" && self._browserVersion < 14) || self._browserName === "safari" || self._isIe) {
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
            if (self._isSafari || self._isIe) {
                return false;
            }
            var worker, url;
            return new Promise(function(resolve) {
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
                var transferList = buffers.map(function(v) {return v.buffer;});
                worker.postMessage({
                    transferList: transferList
                }, transferList);

                var buffersAreNeutered = buffers.filter(function(v) {
                    return v.buffer.byteLength === 0;
                }).length === 2;
                resolve(buffersAreNeutered);
            }).finally(function() {
                if (url) URL.revokeObjectURL(url);
                if (worker) worker.terminate();
            });
        }), "http://caniuse.com/#feat=webworkers", "Web Worker API"]
    };

    return Promise.all(Object.keys(ret).map(function(description) {
        var checker = ret[description][0];
        var canIUseUrl = ret[description][1];
        var apiName = ret[description][2];

        return checker().catch(function() {return false;}).then(function(result) {
            return {
                supported: result,
                canIUseUrl: canIUseUrl,
                apiName: apiName,
                description: description
            };
        });
    }));
};
