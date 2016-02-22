"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird.js");
const touch = require("./features").touch;
const domUtil = require("./DomUtil");
const PlayerPictureManager = require("./PlayerPictureManager");
const serviceWorkerManager = require("./ServiceWorkerManager");
const keyValueDatabase = require("./KeyValueDatabase");

const supported = typeof Notification === "function" &&
                  typeof Notification.maxActions === "number" &&
                  typeof navigator.serviceWorker !== "undefined";
const MAX_ACTIONS = supported ? Notification.maxActions : 0;
const PAUSE = "\u275a\u275a";
const PLAY = "\u23f5";
const NEXT = "\u23f5\u275a";
const PREFERENCE_KEY = "overlay-enabled";

const util = require("./util");
const GlobalUi = require("./GlobalUi");

const NOTIFICATION_TAG = "player-status-notification";
const NOTIFICATIONS_TOOLTIP_ENABLED_MESSAGE = "<p><strong>Disable</strong> overlay</p>";
const NOTIFICATIONS_TOOLTIP_DISABLED_MESSAGE = "<p><strong>Enable</strong> overlay</p>";

function PlaylistNotifications(dom, player) {
    var self = this;
    this._domNode = $(dom);
    this.playlist = player.playlist;
    this.player = player;
    this.enabled = false;
    this.permissionsPromise = null;
    this.currentNotification = null;
    this.currentNotificationCloseTimeout = -1;
    this.tooltip = GlobalUi.makeTooltip(this.$(), function() {
        return self.enabled ? NOTIFICATIONS_TOOLTIP_ENABLED_MESSAGE
                            : NOTIFICATIONS_TOOLTIP_DISABLED_MESSAGE;
    });

    this.settingClicked = this.settingClicked.bind(this);
    this.stateChanged = this.stateChanged.bind(this);
    this.actionNext = this.actionNext.bind(this);
    this.actionPlay = this.actionPlay.bind(this);
    this.actionPause = this.actionPause.bind(this);
    this.notificationClosed = this.notificationClosed.bind(this);

    if (supported) {
        this.$().on("click", this.settingClicked);

        if (touch) {
            this.$().on(domUtil.TOUCH_EVENTS, domUtil.tapHandler(this.settingClicked));
        }
    } else {
        this.$().addClass("no-display");
    }

    this.playlist.on("highlyRelevantTrackMetadataUpdate", this.stateChanged);
    this.playlist.on("nextTrackChange", this.stateChanged);
    this.player.on("newTrackLoad", this.stateChanged);
    this.player.on("pause", this.stateChanged);
    this.player.on("play", this.stateChanged);
    this.player.on("stop", this.stateChanged);
    this.player.on("currentTrackMetadataChange", this.stateChanged);
    serviceWorkerManager.on("actionNext-" + NOTIFICATION_TAG, this.actionNext);
    serviceWorkerManager.on("actionPause-" + NOTIFICATION_TAG, this.actionPause);
    serviceWorkerManager.on("actionPlay-" + NOTIFICATION_TAG, this.actionPlay);
    serviceWorkerManager.on("notificationClose-" + NOTIFICATION_TAG, this.notificationClosed);

    this._currentAction = Promise.resolve();
    this._currentState = {enabled: false};
    var self = this;
    keyValueDatabase.getInitialValues().then(function(values) {
        if (PREFERENCE_KEY in values) {
            self.enabled = !!(values[PREFERENCE_KEY] && self.notificationsEnabled());
            self.update();
        }
    });
}

PlaylistNotifications.prototype._shouldRenderNewState = function(newState) {
    if (!this._currentState.enabled) {
        return newState.enabled;
    }

    var keys = Object.keys(newState);
    var currentState = this._currentState;

    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];

        if (currentState[key] !== newState[key]) {
            return true;
        }
    }
    return false;
};

PlaylistNotifications.prototype.$ = function() {
    return this._domNode;
};

PlaylistNotifications.prototype.update = function() {
    if (this.enabled) {
        this.$().off("mouseleave.justdectivated");
        this.$().removeClass("just-deactivated").addClass("active");
    } else {
        this.$().removeClass("active").addClass("just-deactivated");
        this.$().one("mouseleave.justdectivated", function() {
            $(this).removeClass("just-deactivated");
        });
    }
    this.tooltip.refresh();
    this.stateChanged();
};

PlaylistNotifications.prototype.actionNext = function(data) {
    this.playlist.next();
};

PlaylistNotifications.prototype.actionPlay = function(data) {
    this.player.play();
};

PlaylistNotifications.prototype.actionPause = function(data) {
    this.player.pause();
};

PlaylistNotifications.prototype.notificationClosed = function(data) {
    if (this.permissionsPromise) {
        this.permissionsPromise.cancel();
        this.permissionsPromise = null;
    }
    this.enabled = false;
    this.update();
    keyValueDatabase.set(PREFERENCE_KEY, false);
};

PlaylistNotifications.prototype.stateChanged = function() {
    if (!this.isEnabled()) {
        var state = {enabled: false};
        if (this._shouldRenderNewState(state)) {
            this._currentState = state;
            this._currentAction.cancel();
            this._currentAction = serviceWorkerManager.hideNotifications(NOTIFICATION_TAG);
        }
    } else {
        var isPausedOrStopped = (this.player.isPaused || this.player.isStopped);
        var isPlaying = this.player.isPlaying;
        var track = this.playlist.getCurrentTrack() || this.playlist.getNextTrack();

        if (!track) {
            return;
        }

        var state = {
            enabled: true,
            isPlaying: isPlaying,
            isPausedOrStopped: isPausedOrStopped,
            track: track,
            tagDataState: track.getTagStateId()
        };

        if (!this._shouldRenderNewState(state)) {
            return;
        }

        this._currentState = state;
        var actions = [];

        if (this.playlist.getNextTrack() && actions.length < MAX_ACTIONS) {
            actions.push({action: "Next", title: NEXT + " Next track"});
        }

        if ((this.player.isPaused || this.player.isStopped) && actions.length < MAX_ACTIONS) {
            actions.push({action: "Play", title: PLAY + " Play"})
        } else if (this.player.isPlaying && actions.length < MAX_ACTIONS) {
            actions.push({action: "Pause", title: PAUSE + " Pause"});
        }

        this._currentAction.cancel();
        var imageUrl;
        // Chrome flickers and reloads the image every time, unusable
        // this._currentAction = track.getImage().bind(this).then(function(image) {
        this._currentAction = Promise.bind(this).delay(100).then(function() {
            //if (image.blob) {
                //imageUrl = URL.createObjectURL(image.blob);
            //} else {
                //imageUrl = image.src;
            //}
            var info = track.getTrackInfo();

            var body = info.artist;
            var title = (track.getIndex() + 1) + ". " + info.title + " (" + track.formatTime() + ")";

            return serviceWorkerManager.showNotification(title, {
                tag: NOTIFICATION_TAG,
                body: body,
                //icon: imageUrl,
                icon: PlayerPictureManager.getDefaultImage().src,
                requireInteraction: true,
                renotify: false,
                noscreen: true,
                silent: true,
                sticky: true,
                actions: actions
            });
        }).finally(function() {
            if (imageUrl) {
                try {
                    URL.revokeObjectURL(imageUrl);
                } catch (e) {}
                imageUrl = null;
            }
        });
    }
};

PlaylistNotifications.prototype.toggleSetting = function() {
    var self = this;
    if (this.enabled) {
        if (this.permissionsPromise) {
            this.permissionsPromise.cancel();
            this.permissionsPromise = null;
        }
        this.enabled = false;
        self.update();
        keyValueDatabase.set(PREFERENCE_KEY, false);
    } else {

        if (this.permissionsPromise) return;
        this.requestPermission().then(function(permission) {
            keyValueDatabase.set(PREFERENCE_KEY, permission);
            self.enabled = permission;
            self.update();
        });
    }
};

PlaylistNotifications.prototype.settingClicked = function(e) {
    GlobalUi.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    this.toggleSetting();
};

PlaylistNotifications.prototype.isEnabled = function() {
    return this.enabled && this.notificationsEnabled();
};

PlaylistNotifications.prototype.notificationsEnabled = function() {
    return supported && Notification.permission === "granted";
};

PlaylistNotifications.prototype.requestPermission = function() {
    if (this.permissionsPromise) return Promise.reject(new Error("already requested"));
    var ret;
    var self = this;
    if (!supported) {
        ret = Promise.resolve(false);
    } else if (Notification.permission === "granted") {
        ret = Promise.resolve(true);
    } else {
        ret = new Promise(function(resolve) {
            Notification.requestPermission(function() {
                setTimeout(function() {
                    resolve(self.notificationsEnabled());
                }, 1);
            });
        });
    }

    ret = ret.finally(function() {
        self.permissionsPromise = null;
    });

    this.permissionsPromise = ret;
    return ret;
};

module.exports = PlaylistNotifications;

