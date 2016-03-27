"use strict";

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
"page",
"env",
"db",
"dbValues",
"defaultTitle",
"globalEvents",
"animationContext",
"recognizerContext",
"sliderContext",
"gestureScreenFlasher",
"rippler",
"keyboardShortcuts",
"menuContext",
"fileInputContext",
"scrollEvents",
"scrollerContext",
"tooltipContext",
"snackbar",
"toolbarSubmenu",
"popupContext",
"spinner",
"gestureEducator",
"serviceWorkerManager",
"applicationPreferences",
"effectPreferences",
"crossfadingPreferences",
"playlist",
"trackAnalyzer",
"search",
"queue",
"mainTabs",
"localFileHandler",
"player",
"playerPictureManager",
"playerTimeManager",
"playerVolumeManager",
"playlistNotifications",
"visualizerCanvas",
"trackDisplay",
"defaultShortcuts",
"playlistModeManager"
].forEach(function(v) {
    Object.defineProperty(ApplicationDependencies.prototype, v, {
        configurable: false,
        enumerable: true,
        set: function() {
            throw new Error("read-only");
        },

        get: function() {
            if (this._opts[v] !== undefined) {
                this._checkedOpts[v] = true;
                return this._opts[v];
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
