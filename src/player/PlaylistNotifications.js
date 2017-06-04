"use strict";

import { URL } from "platform/platform";

const PAUSE = "\u275a\u275a";
const PLAY = "\u23f5";
const NEXT = "\u23f5\u275a";
const PREFERENCE_KEY = "overlay-enabled";
const NOTIFICATION_TAG = "player-status-notification";
const NOTIFICATIONS_TOOLTIP_ENABLED_MESSAGE = "Disable overlay";
const NOTIFICATIONS_TOOLTIP_DISABLED_MESSAGE = "Enable overlay";
const UNKNOWN = "<Unknown>";

export default function PlaylistNotifications(opts, deps) {
    opts = Object(opts);
    this.permissionPrompt = deps.permissionPrompt;
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
    this.enabled = this.env.mediaSessionSupport();
    this.permissionsPromise = null;
    this.currentNotification = null;
    this.currentNotificationCloseTimeout = -1;
    this.nextNotificationId = -1;
    this.tooltip = this.tooltipContext.createTooltip(this.$(), function() {
        return self.enabled ? NOTIFICATIONS_TOOLTIP_ENABLED_MESSAGE
                            : NOTIFICATIONS_TOOLTIP_DISABLED_MESSAGE;
    });

    this.settingClicked = this.settingClicked.bind(this);
    this.stateChanged = this.stateChanged.bind(this);
    this.actionNext = this.actionNext.bind(this);
    this.actionPrev = this.actionPrev.bind(this);
    this.actionPlay = this.actionPlay.bind(this);
    this.actionPause = this.actionPause.bind(this);
    this.actionForward = this.actionForward.bind(this);
    this.actionBackward = this.actionBackward.bind(this);
    this.notificationClosed = this.notificationClosed.bind(this);
    this.justDeactivatedMouseleft = this.justDeactivatedMouseleft.bind(this);

    if (this.env.mediaSessionSupport()) {
        this.$().addClass("no-display");
    } else {
        if (this.env.maxNotificationActions() > 0) {
            this.$().addEventListener("click", this.settingClicked)
                    .addEventListener("mousedown", this.page.preventDefaultHandler);
            this.recognizerContext.createTapRecognizer(this.settingClicked).recognizeBubbledOn(this.$());
        } else {
            this.$().addClass("no-display");
        }
    }

    this.playlist.on("highlyRelevantTrackMetadataUpdate", this.stateChanged);
    this.playlist.on("nextTrackChange", this.stateChanged);
    this.player.on("newTrackLoad", this.stateChanged);
    this.player.on("pause", this.stateChanged);
    this.player.on("play", this.stateChanged);
    this.player.on("stop", this.stateChanged);
    this.player.on("currentTrackMetadataChange", this.stateChanged);

    if (this.env.mediaSessionSupport()) {
        this.page.addMediaActionListener("play", this.actionPlay);
        this.page.addMediaActionListener("pause", this.actionPause);
        this.page.addMediaActionListener("seekbackward", this.actionBackward);
        this.page.addMediaActionListener("seekforward", this.actionForward);
        this.page.addMediaActionListener("previoustrack", this.actionPrev);
        this.page.addMediaActionListener("nexttrack", this.actionNext);
    } else {
        this.serviceWorkerManager.on("actionNext-" + NOTIFICATION_TAG, this.actionNext);
        this.serviceWorkerManager.on("actionPause-" + NOTIFICATION_TAG, this.actionPause);
        this.serviceWorkerManager.on("actionPlay-" + NOTIFICATION_TAG, this.actionPlay);
        this.serviceWorkerManager.on("notificationClose-" + NOTIFICATION_TAG, this.notificationClosed);
    }

    this._currentAction = Promise.resolve();
    this._currentState = {enabled: this.env.mediaSessionSupport()};

    if (!this.env.mediaSessionSupport() && PREFERENCE_KEY in deps.dbValues) {
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
    if (this.env.mediaSessionSupport()) {
        return;
    }
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

PlaylistNotifications.prototype.actionForward = function() {
    var p = this.player.getProgress();
    if (p !== -1) {
        this.player.setProgress(Math.max(Math.min(1, p + 0.01), 0));
    }
};

PlaylistNotifications.prototype.actionBackward = function() {
    var p = this.player.getProgress();
    if (p !== -1) {
        this.player.setProgress(Math.max(Math.min(1, p - 0.01), 0));
    }
};

PlaylistNotifications.prototype.actionPrev = function() {
    this.playlist.prev();
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

PlaylistNotifications.prototype.disableMediaSession = function() {
    if (this.env.mediaSessionSupport()) {
        this.page.platform().setMediaState({
            isPlaying: false,
            isPaused: false
        });
        return true;
    }
    return false;
};

PlaylistNotifications.prototype.stateChanged = async function() {
    if (!this.isEnabled()) {
        var state = {enabled: false};
        if (this._shouldRenderNewState(state)) {
            this._currentState = state;
            ++this.nextNotificationId;
            if (!this.disableMediaSession()) {
                this._currentAction = this.serviceWorkerManager.hideNotifications(NOTIFICATION_TAG);
            }
        }
        return;
    }
    var isPausedOrStopped = (this.player.isPaused || this.player.isStopped);
    var isPlaying = this.player.isPlaying;
    var track = this.playlist.getCurrentTrack() || this.playlist.getNextTrack();

    if (!track) {
        return this.disableMediaSession();
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

    if (!this.env.mediaSessionSupport()) {
        if (this.playlist.getNextTrack() && actions.length < maxActions) {
            actions.push({action: "Next", title: NEXT + " Next track"});
        }

        if ((this.player.isPaused || this.player.isStopped) && actions.length < maxActions) {
            actions.push({action: "Play", title: PLAY + " Play"});
        } else if (this.player.isPlaying && actions.length < maxActions) {
            actions.push({action: "Pause", title: PAUSE + " Pause"});
        }
    }

    var id = ++this.nextNotificationId;
    var imageUrl;
    // For notifications chrome flickers and reloads the image every time, unusable
    // this._currentAction = track.getImage().then(function(image) {
    this._currentAction = this.env.mediaSessionSupport() ? track.getImage() : Promise.delay(100);
    try {
        imageUrl = await this._currentAction;
        if (id !== this.nextNotificationId) return;
        if (this.env.mediaSessionSupport()) {
            if (image.blob) {
                imageUrl = URL.createObjectURL(image.blob);
            } else {
                imageUrl = image.src;
            }
        }
        var info = track.getTrackInfo();

        var body = info.artist;
        var title = (track.getIndex() + 1) + ". " + info.title + " (" + track.formatTime() + ")";

        if (this.env.mediaSessionSupport()) {
            var tagData = track.getTagData();
            var album = tagData ? tagData.getAlbum() || UNKNOWN : UNKNOWN;
            this.page.platform().setMediaState({
                title: (track.getIndex() + 1) + ". " + info.title,
                artist: info.artist,
                album: album,
                artwork: [{src: imageUrl}],
                isPlaying: this.player.isPlaying,
                isPaused: this.player.isPaused
            });
            return;
        }
        await this.serviceWorkerManager.showNotification(title, {
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
    } finally {
        if (imageUrl) {
            try {
                URL.revokeObjectURL(imageUrl);
            } catch (e) {}
        }
    }
};

PlaylistNotifications.prototype.toggleSetting = async function() {
    if (this.enabled) {
        this.enabled = false;
        this.update();
        this.db.set(PREFERENCE_KEY, false);
    } else {
        if (this.permissionsPromise) return;
        var permission = await this.requestPermission();
        this.db.set(PREFERENCE_KEY, permission);
        this.enabled = permission;
        this.update();
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
            this.page.platform().notificationPermissionGranted();
};

PlaylistNotifications.prototype._doRequestPermission = async function() {
    await this.permissionPrompt.prompt(async function() {
        await this.page.platform().requestNotificationPermission();
    });
    await Promise.delay(1);
    return this.notificationsEnabled();
};

PlaylistNotifications.prototype.requestPermission = async function() {
    if (this.permissionsPromise) throw new Error("already requested");
    var ret;
    try {
        if (this.env.maxNotificationActions() <= 0) {
            ret = false;
        } else if (this.page.platform().notificationPermissionGranted()) {
            ret = true;
        } else {
            this.permissionsPromise = this._doRequestPermission();
            ret = await this.permissionsPromise;
        }
    } finally {
        this.permissionsPromise = null;
    }
    return ret;
};

