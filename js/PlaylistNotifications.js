var PlaylistNotifications = (function() { "use strict";

const Notification = window.Notification;

const NOTIFICATIONS_EXPLANATION = "<p>When this browser window is not active, " +
        "a notification will be shown when the current track changes. The notification " +
        "can be clicked to skip the track.</p>";

const NOTIFICATIONS_TOOLTIP_ENABLED_MESSAGE = "<p><strong>Disable</strong> notifications</p>"

const NOTIFICATIONS_TOOLTIP_DISABLED_MESSAGE = "<p><strong>Enable</strong> notifications</p>" +
    NOTIFICATIONS_EXPLANATION;

function PlaylistNotifications(dom, player) {
    var self = this;
    this._domNode = $(dom);
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
    this.notificationErrored = this.notificationErrored.bind(this);
    this.notificationClicked = this.notificationClicked.bind(this);

    this.$().on("click", this.settingClicked);
    util.documentHidden.on("change", this.visibilityChanged);
    this.player.on("newTrackLoad", this.newTrackLoaded);

    this.update();
}

PlaylistNotifications.prototype.$ = function() {
    return this._domNode;
};

PlaylistNotifications.prototype.update = function() {
    if (this.enabled) {
        this.$().off("mouseleave.justdectivated")
        this.$().removeClass("just-deactivated").addClass("active");
    } else {
        this.$().removeClass("active").addClass("just-deactivated");
        this.$().one("mouseleave.justdectivated", function() {
            $(this).removeClass("just-deactivated");
        });
    }
    this.tooltip.refresh();
};

PlaylistNotifications.prototype.clearTimers = function() {
    if (this.currentNotificationCloseTimeout !== -1) {
        clearTimeout(this.currentNotificationCloseTimeout);
        this.currentNotificationCloseTimeout = -1;
    }
};

PlaylistNotifications.prototype.destroyCurrentNotification = function() {
    if (this.currentNotificationCloseTimeout !== -1) {
        clearTimeout(this.currentNotificationCloseTimeout);
        this.currentNotificationCloseTimeout = -1;
    }

    if (this.currentNotification) {
        var notification = this.currentNotification;
        this.currentNotification = null;
        notification.removeEventListener("error", this.notificationErrored, false);
        notification.removeEventListener("click", this.notificationClicked, false);
        notification.close();
    }
};

PlaylistNotifications.prototype.notificationClicked = function(e) {
    e.preventDefault();
    this.clearTimers();
    this.playlist.next();
};

PlaylistNotifications.prototype.notificationErrored = function(e) {
    this.destroyCurrentNotification();
};

PlaylistNotifications.prototype.showNotificationForCurrentTrack = function() {
    var track = this.playlist.getCurrentTrack();
    var tagData = track.getTagData();
    var body = "";
    if (tagData) body = tagData.getAlbum() || "";

    if (body) {
        body += "\n\n(Click to skip)";
    } else {
        body += "(Click to skip)";
    }

    var title = (track.getIndex() + 1) + ". " +
            track.formatName() + " ("+track.formatTime()+")";

    var notification = new Notification(title, {
        tag: "track-change-notification",
        body: body,
        icon: track.getImageUrl()
    });

    this.currentNotification = notification;
    notification.addEventListener("click", this.notificationClicked, false);
    notification.addEventListener("error", this.notificationErrored, false);
};

PlaylistNotifications.prototype.newTrackLoaded = function() {
    this.clearTimers();
    if (this.shouldNotify()) {
        var self = this;
        self.showNotificationForCurrentTrack();
        self.currentNotificationCloseTimeout = setTimeout(function() {
            self.currentNotificationCloseTimeout = -1;
            self.destroyCurrentNotification();
        }, 10000);
    } else {
        this.destroyCurrentNotification();
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

return PlaylistNotifications;
})();
