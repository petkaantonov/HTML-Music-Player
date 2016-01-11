"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird.js");
const touch = require("./features").touch;
const domUtil = require("./DomUtil");


const util = require("./util");
const GlobalUi = require("./GlobalUi");
const serviceWorkerManager = require("./ServiceWorkerManager");

const NOTIFICATIONS_EXPLANATION = "<p>When this browser window is not active, " +
        "a notification will be shown when the current track changes. The notification " +
        "can be clicked to skip the track.</p>";

const NOTIFICATIONS_TOOLTIP_ENABLED_MESSAGE = "<p><strong>Disable</strong> notifications</p>";

const NOTIFICATIONS_TOOLTIP_DISABLED_MESSAGE = "<p><strong>Enable</strong> notifications</p>" +
    NOTIFICATIONS_EXPLANATION;

function PlaylistNotifications(dom, player) {
    var self = this;
    this._domNode = $(dom);
    this._notificationRequestId = 0;
    this.playlist = player.playlist;
    this.player = player;
    this.enabled = this.notificationsEnabled();
    this.permissionsPromise = null;
    this.tabVisible = !util.documentHidden.value();
    this.currentNotification = null;
    this.currentNotificationCloseTimeout = -1;
    this.tooltip = GlobalUi.makeTooltip(this.$(), function() {
        return self.enabled ? NOTIFICATIONS_TOOLTIP_ENABLED_MESSAGE
                            : NOTIFICATIONS_TOOLTIP_DISABLED_MESSAGE;
    });

    this.settingClicked = this.settingClicked.bind(this);
    this.visibilityChanged = this.visibilityChanged.bind(this);
    this.newTrackLoaded = this.newTrackLoaded.bind(this);
    this.actionNext = this.actionNext.bind(this);
    

    if (!touch) {
        this.$().on("click", this.settingClicked);
    } else {
        this.$().on("touchstart touchend", domUtil.tapHandler(this.settingClicked));
    }
    util.documentHidden.on("change", this.visibilityChanged);
    this.player.on("newTrackLoad", this.newTrackLoaded);
    serviceWorkerManager.on("actionNext", this.actionNext);

    this.update();
}

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
};

PlaylistNotifications.prototype.actionNext = function(data) {
    this.playlist.next();
};

PlaylistNotifications.prototype.showNotificationForCurrentTrack = function() {
    var track = this.playlist.getCurrentTrack();
    var id = ++this._notificationRequestId;

    track.getImageUrl().bind(this).then(function(imageUrl) {
        if (id !== this._notificationRequestId) return;
        var info = track.getTrackInfo();

        var body = info.artist;
        var title = (track.getIndex() + 1) + ". " + info.title + " (" + track.formatTime() + ")";

        return serviceWorkerManager.showNotification(title, {
            tag: "track-change-notification",
            body: body,
            icon: imageUrl,
            requireInteraction: true,
            renotify: false,
            sticky: true,
            actions: [
                {action: "Next", title: "Next track"}
            ]
        });
    });
};

PlaylistNotifications.prototype.newTrackLoaded = function() {
    if (this.shouldNotify()) {
        this.showNotificationForCurrentTrack();
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
    } else {

        if (this.permissionsPromise) return;
        this.requestPermission().then(function(permission) {
            self.enabled = permission;
            self.update();
        });
    }
};

PlaylistNotifications.prototype.visibilityChanged = function() {
    this.tabVisible = !util.documentHidden.value();
};

PlaylistNotifications.prototype.settingClicked = function() {
    this.toggleSetting();
};

PlaylistNotifications.prototype.shouldNotify = function() {
    return this.enabled && !this.tabVisible;
};

PlaylistNotifications.prototype.notificationsEnabled = function() {
    return typeof Notification === "function" && Notification.permission === "granted";
};

PlaylistNotifications.prototype.requestPermission = function() {
    if (this.permissionsPromise) return Promise.reject(new Error("already requested"));
    var ret;
    var self = this;
    if (typeof Notification !== "function") {
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

