"use strict";

import { ensureType } from "util";

const rStackClass = /at new ([^ ]+)/;

export default function ApplicationDependencies(opts) {
    this._checkedOpts = Object.create(null);
    Object.keys(opts).forEach(function(v) {
        this._checkedOpts[v] = false;
    }, this);
    this._opts = Object.freeze(opts);
}

ApplicationDependencies.prototype.ensure = function() {
    Object.keys(this._checkedOpts).forEach(function(v) {
        if (this._checkedOpts[v] !== true) {
            var stack = new Error().stack;
            var message = "unneeded dependency passed: " + v;

            if (stack) {
                var m = stack.match(rStackClass);
                if (m) {
                    var klass = m[1];
                    message = klass + " doesn't depend on " + v + " but it was passed in";
                }
            }
            throw new Error(message);
        }
    }, this);
};

[
    ["page", "object"],
    ["env", "object"],
    ["db", "object"],
    ["dbValues", "object"],
    ["defaultTitle", "string"],
    ["globalEvents", "object"],
    ["animationContext", "object"],
    ["recognizerContext", "object"],
    ["sliderContext", "object"],
    ["gestureScreenFlasher", "object"],
    ["rippler", "object"],
    ["keyboardShortcuts", "object"],
    ["menuContext", "object"],
    ["fileInputContext", "object"],
    ["scrollEvents", "object"],
    ["scrollerContext", "object"],
    ["tooltipContext", "object"],
    ["snackbar", "object"],
    ["toolbarSubmenu", "object"],
    ["popupContext", "object"],
    ["spinner", "object"],
    ["gestureEducator", "object"],
    ["serviceWorkerManager", "object"],
    ["applicationPreferences", "object"],
    ["effectPreferences", "object"],
    ["crossfadingPreferences", "object"],
    ["playlist", "object"],
    ["trackAnalyzer", "object"],
    ["search", "object"],
    ["queue", "null"],
    ["mainTabs", "object"],
    ["localFileHandler", "object"],
    ["player", "object"],
    ["playerPictureManager", "object"],
    ["playerTimeManager", "object"],
    ["playerVolumeManager", "object"],
    ["playlistNotifications", "object"],
    ["visualizerCanvas", "object"],
    ["trackDisplay", "object"],
    ["defaultShortcuts", "object"],
    ["playlistModeManager", "object"],
    ["permissionPrompt", "object"]
].forEach(function(spec) {
    var v = spec[0];
    var type = spec[1];
    Object.defineProperty(ApplicationDependencies.prototype, v, {
        configurable: false,
        enumerable: true,
        set: function() {
            throw new Error("read-only");
        },

        get: function() {
            if (this._opts[v] !== undefined) {
                this._checkedOpts[v] = true;
                return ensureType(this._opts[v], type);
            } else {
                var stack = (new Error()).stack;
                var message = "needed dependency unpassed: " + v;
                if (stack) {
                    var m = stack.match(rStackClass);
                    if (m) {
                        var klass = m[1];
                        message = klass + " depends on " + v + " but it was not passed in";
                    }
                }
                throw new Error(message);
            }
        }
    });

});
