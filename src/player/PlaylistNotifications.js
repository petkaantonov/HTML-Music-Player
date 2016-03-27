"use strict";

import { URL } from "platform/platform";

const PAUSE = "\u275a\u275a";
const PLAY = "\u23f5";
const NEXT = "\u23f5\u275a";
const PREFERENCE_KEY = "overlay-enabled";
const NOTIFICATION_TAG = "player-status-notification";
const NOTIFICATIONS_TOOLTIP_ENABLED_MESSAGE = "<p><strong>Disable</strong> overlay</p>";
const NOTIFICATIONS_TOOLTIP_DISABLED_MESSAGE = "<p><strong>Enable</strong> overlay</p>";

export default function PlaylistNotifications(opts, deps) {
    opts = Object(opts);
    this.env = deps.env;
    this.page = deps.page;
    this.serviceWorkerManager = deps.serviceWorkerManager;
    this.db = deps.db;
    this.recognizerContext = deps.recognizerContext;
    this.dbValues = deps.dbValues;
    this.rippler = deps.rippler;
    this.tooltipContext = deps.tooltipContext;
    this.playlist = deps.playlist;
    this.player = deps.player;

    var self = this;
    this._domNode = this.page.$(opts.target);
    this.enabled = false;
    this.permissionsPromise = null;
    this.currentNotification = null;
    this.currentNotificationCloseTimeout = -1;
    this.nextNotificationId = -1;
    this.tooltip = this.tooltipContext.makeTooltip(this.$(), function() {
        return self.enabled ? NOTIFICATIONS_TOOLTIP_ENABLED_MESSAGE
                            : NOTIFICATIONS_TOOLTIP_DISABLED_MESSAGE;
    });

    this.settingClicked = this.settingClicked.bind(this);
    this.stateChanged = this.stateChanged.bind(this);
    this.actionNext = this.actionNext.bind(this);
    this.actionPlay = this.actionPlay.bind(this);
    this.actionPause = this.actionPause.bind(this);
    this.notificationClosed = this.notificationClosed.bind(this);
    this.justDeactivatedMouseleft = this.justDeactivatedMouseleft.bind(this);

    if (this.env.maxNotificationActions() > 0) {
        this.$().addEventListener("click", this.settingClicked)
                .addEventListener("mousedown", this.page.preventDefaultHandler);
        this.recognizerContext.createTapRecognizer(this.settingClicked).recognizeBubbledOn(this.$());
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
    this.serviceWorkerManager.on("actionNext-" + NOTIFICATION_TAG, this.actionNext);
    this.serviceWorkerManager.on("actionPause-" + NOTIFICATION_TAG, this.actionPause);
    this.serviceWorkerManager.on("actionPlay-" + NOTIFICATION_TAG, this.actionPlay);
    this.serviceWorkerManager.on("notificationClose-" + NOTIFICATION_TAG, this.notificationClosed);

    this._currentAction = Promise.resolve();
    this._currentState = {enabled: false};

    if (PREFERENCE_KEY in deps.dbValues) {
        this.enabled = !!(deps.dbValues[PREFERENCE_KEY] && this.notificationsEnabled());
        this.update();
    }
    deps.ensure();
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

PlaylistNotifications.prototype.justDeactivatedMouseleft = function(e) {
    e.currentTarget.classList.remove("just-deactivated");
    e.currentTarget.removeEventListener("mouseleave", this.justDeactivatedMouseleft);
};

PlaylistNotifications.prototype.update = function() {
    if (this.enabled) {
        this.$().removeEventListener("mouseleave", this.justDeactivatedMouseleft)
                .removeClass("just-deactivated")
                .addClass("active");
    } else {
        this.$()
            .removeClass("active")
            .addClass("just-deactivated")
            .addEventListener("mouseleave", this.justDeactivatedMouseleft);
    }
    this.tooltip.refresh();
    this.stateChanged();
};

PlaylistNotifications.prototype.actionNext = function() {
    this.playlist.next(true);
};

PlaylistNotifications.prototype.actionPlay = function() {
    this.player.play();
};

PlaylistNotifications.prototype.actionPause = function() {
    this.player.pause();
};

PlaylistNotifications.prototype.notificationClosed = function() {
    this.enabled = false;
    this.update();
    this.db.set(PREFERENCE_KEY, false);
};

PlaylistNotifications.prototype.stateChanged = function() {
    if (!this.isEnabled()) {
        var state = {enabled: false};
        if (this._shouldRenderNewState(state)) {
            this._currentState = state;
            ++this.nextNotificationId;
            this._currentAction = this.serviceWorkerManager.hideNotifications(NOTIFICATION_TAG);
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
        var maxActions = this.env.maxNotificationActions();
        var actions = [];

        if (this.playlist.getNextTrack() && actions.length < maxActions) {
            actions.push({action: "Next", title: NEXT + " Next track"});
        }

        if ((this.player.isPaused || this.player.isStopped) && actions.length < maxActions) {
            actions.push({action: "Play", title: PLAY + " Play"});
        } else if (this.player.isPlaying && actions.length < maxActions) {
            actions.push({action: "Pause", title: PAUSE + " Pause"});
        }

        var id = ++this.nextNotificationId;
        var imageUrl;
        // Chrome flickers and reloads the image every time, unusable
        // this._currentAction = track.getImage().then(function(image) {
        this._currentAction = Promise.delay(100).then(function() {
            if (id !== this.nextNotificationId) return;
            //if (image.blob) {
                //imageUrl = URL.createObjectURL(image.blob);
            //} else {
                //imageUrl = image.src;
            //}
            var info = track.getTrackInfo();

            var body = info.artist;
            var title = (track.getIndex() + 1) + ". " + info.title + " (" + track.formatTime() + ")";

            return this.serviceWorkerManager.showNotification(title, {
                tag: NOTIFICATION_TAG,
                body: body,
                //icon: imageUrl,
                //icon: PlayerPictureManager.getDefaultImage().src,
                requireInteraction: true,
                renotify: false,
                noscreen: true,
                silent: true,
                sticky: true,
                actions: actions
            });
        }.bind(this)).finally(function() {
            if (imageUrl) {
                try {
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
        this.enabled = false;
        self.update();
        this.db.set(PREFERENCE_KEY, false);
    } else {

        if (this.permissionsPromise) return;
        this.requestPermission().then(function(permission) {
            self.db.set(PREFERENCE_KEY, permission);
            self.enabled = permission;
            self.update();
        });
    }
};

PlaylistNotifications.prototype.settingClicked = function(e) {
    this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    this.toggleSetting();
};

PlaylistNotifications.prototype.isEnabled = function() {
    return this.enabled && this.notificationsEnabled();
};

PlaylistNotifications.prototype.notificationsEnabled = function() {
    return this.env.maxNotificationActions() > 0 &&
            this.page.window().Notification.permission === "granted";
};

PlaylistNotifications.prototype.requestPermission = function() {
    if (this.permissionsPromise) return Promise.reject(new Error("already requested"));
    var ret;
    var self = this;
    if (this.env.maxNotificationActions() <= 0) {
        ret = Promise.resolve(false);
    } else if (this.page.window().Notification.permission === "granted") {
        ret = Promise.resolve(true);
    } else {
        ret = new Promise(function(resolve) {
            self.page.window().Notification.requestPermission(function() {
                self.page.setTimeout(function() {
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

