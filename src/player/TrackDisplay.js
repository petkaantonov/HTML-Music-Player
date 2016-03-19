"use strict";

export default function TrackDisplay(dom, playlist, opts) {
    opts = Object(opts);
    this._page = opts.page;
    this._globalEvents = opts.globalEvents;
    this._playlist = playlist;
    this._containerNode = this._page.$(dom).eq(0);
    this._domNode = this.$container().find(opts.target);
    this._delay = +opts.delay || 5000;
    this._pixelsPerSecond = +opts.pixelsPerSecond || 22;
    this._defaultTitle = opts.defaultTitle;

    this._progress = 0;
    this._currentTrack = null;

    this._containerWidth = -1;
    this._contentWidth = -1;
    this._delayTimeoutId = -1;
    this._frameId = -1;
    this._previousTime = -1;
    this._renderedX = 0;

    this._frame = this._frame.bind(this);
    this._trackDataUpdated = this._trackDataUpdated.bind(this);
    this._trackIndexChanged = this._trackIndexChanged.bind(this);
    this._windowResized = this._windowResized.bind(this);
    this._delayElapsed = this._delayElapsed.bind(this);

    this._globalEvents.on("foreground", this._windowResized);
    this._globalEvents.on("resize", this._windowResized);
    this._playlist.on("trackChange", this._trackChanged.bind(this));

    this._updateText();
    this._reset();
}

TrackDisplay.prototype.$ = function() {
    return this._domNode;
};

TrackDisplay.prototype.$container = function() {
    return this._containerNode;
};

TrackDisplay.prototype._clearFrame = function() {
    this._page.cancelAnimationFrame(this._frameId);
    this._frameId = -1;
};

TrackDisplay.prototype._clearDelayTimeout = function() {
    this._page.clearTimeout(this._delayTimeoutId);
    this._delayTimeoutId = -1;
};

TrackDisplay.prototype._updateText = function() {
    var track = this._currentTrack;

    if (track) {
        var index = track.getIndex();
        var trackNumber = index >= 0 ? (index + 1) + ". " : "";
        var title = trackNumber + track.formatFullName();
        this.$().setText(title);
        this._page.setTitle(title);
    } else {
        this.$().setText("");
        this._page.setTitle(this._defaultTitle);
    }
};

TrackDisplay.prototype._trackChanged = function(track) {
    if (!track) track = null;
    this.setTrack(track);
};

TrackDisplay.prototype._trackDataUpdated = function() {
    this._updateText();
    this._reset();
};

TrackDisplay.prototype._trackIndexChanged = function() {
    this._updateText();
    this._reset();
};

TrackDisplay.prototype._windowResized = function() {
    this._reset();
};

TrackDisplay.prototype._getScrollWidth = function() {
    var ret = Math.max(-5, this._contentWidth - this._containerWidth) + 5;
    return Math.max(0, ret);
};

TrackDisplay.prototype._frame = function(now) {
    this._frameId = -1;
    var scrollWidth = this._getScrollWidth();
    if (scrollWidth <= 0) return;

    var elapsed = this._previousTime === -1 ? 0 : now - this._previousTime;
    this._previousTime = now;
    var progressPerMs = this._pixelsPerSecond / scrollWidth / 2 / 1000;
    var previousProgress = this._progress;
    if (elapsed > 0) {
        this._progress += (elapsed * progressPerMs);
    }

    var progress = Math.min(1, Math.max(0, this._progress));
    if (progress >= 1) {
        this._progress = 0;
        this._startTimer();
    } else if (progress >= 0.5 && previousProgress < 0.5) {
        this._startTimer();
    } else {
        this._frameId = this._page.requestAnimationFrame(this._frame);
    }

    var x;
    if (progress < 0.5) {
        x = (progress / 0.5) * scrollWidth;
    } else {
        x = (1 - ((progress - 0.5) / 0.5)) * scrollWidth;
    }
    x = Math.round(x);

    if (this._renderedX !== x) {
        this._renderedX = x;
        this.$().setTransform("translate3d(-"+x+"px, 0, 0)");
    }
};

TrackDisplay.prototype._delayElapsed = function() {
    this._clearFrame();
    this._frameId = this._page.requestAnimationFrame(this._frame);
};

TrackDisplay.prototype._startTimer = function() {
    this._previousTime = -1;
    this._clearDelayTimeout();
    this._clearFrame();
    this._delayTimeoutId = this._page.setTimeout(this._delayElapsed, this._delay);
};

TrackDisplay.prototype._reset = function() {
    this._clearDelayTimeout();
    this._clearFrame();
    this._progress = 0;
    this._previousTime = -1;
    this.$().setTransform("translate3d(0, 0, 0)");
    this._renderedX = 0;

    if (!this._globalEvents.isWindowBackgrounded()) {
        this._containerWidth = this.$container()[0].getBoundingClientRect().width;
        this._contentWidth = this.$()[0].getBoundingClientRect().width;
    }

    var scrollWidth = this._getScrollWidth();
    if (scrollWidth > 0) {
        this._startTimer();
        this.$().setStyle("willChange", "transform");
    } else {
        this.$().setStyle("willChange", "");
    }
};

TrackDisplay.prototype.setTrack = function(track) {
    if (this._currentTrack === track) return;
    if (this._currentTrack) {
        this._currentTrack.removeListener("indexChange", this._trackIndexChanged);
        this._currentTrack.removeListener("tagDataUpdate", this._trackDataUpdated);
    }
    this._currentTrack = track;

    if (track) {
        this._currentTrack.on("indexChange", this._trackIndexChanged);
        this._currentTrack.on("tagDataUpdate", this._trackDataUpdated);
    }
    this._updateText();
    this._reset();
};
