"use strict";
const $ = require("lib/jquery");
const domUtil = require("lib/DomUtil");
const util = require("lib/util");

function TrackDisplay(dom, opts) {
    opts = Object(opts);
    this._containerNode = $($(dom)[0]);
    this._domNode = this.$container().find(opts.target);
    this._delay = +opts.delay || 5000;
    this._pixelsPerSecond = +opts.pixelsPerSecond || 22;

    this._progress = 0;
    this._currentTrack = null;

    this._containerWidth = -1;
    this._contentWidth = -1;
    this._delayTimeoutId = -1;
    this._frameId = -1;
    this._previousTime = -1;

    this._frame = this._frame.bind(this);
    this._trackDataUpdated = this._trackDataUpdated.bind(this);
    this._trackIndexChanged = this._trackIndexChanged.bind(this);
    this._windowResized = this._windowResized.bind(this);
    this._delayElapsed = this._delayElapsed.bind(this);

    util.documentHidden.on("foreground", this._windowResized);
    $(window).on("sizechange", this._windowResized);
}

TrackDisplay.prototype.$ = function() {
    return this._domNode;
};

TrackDisplay.prototype.$container = function() {
    return this._containerNode;
};

TrackDisplay.prototype._clearFrame = function() {
    if (this._frameId !== -1) {
        cancelAnimationFrame(this._frameId);
        this._frameId = -1;
    }
};

TrackDisplay.prototype._clearDelayTimeout = function() {
    if (this._delayTimeoutId !== -1) {
        clearTimeout(this._delayTimeoutId);
        this._delayTimeoutId = -1;
    }
};

TrackDisplay.prototype._updateText = function() {
    var track = this._currentTrack;

    if (track) {
        var index = track.getIndex();
        var trackNumber = index >= 0 ? (index + 1) + ". " : "";
        var title = trackNumber + track.formatFullName();
        this.$().text(title);
        document.title = title;
    }
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
        this._frameId = requestAnimationFrame(this._frame);
    }

    var x;
    if (progress < 0.5) {
        x = (progress / 0.5) * scrollWidth;
    } else {
        x = (1 - ((progress - 0.5) / 0.5)) * scrollWidth;
    }

    domUtil.setTransform(this.$(), "translate3d(-"+x+"px, 0, 0)");
};

TrackDisplay.prototype._delayElapsed = function() {
    this._clearFrame();
    requestAnimationFrame(this._frame);
};

TrackDisplay.prototype._startTimer = function() {
    this._previousTime = -1;
    this._clearDelayTimeout();
    this._clearFrame();
    this._delayTimeoutId = setTimeout(this._delayElapsed, this._delay);
};

TrackDisplay.prototype._reset = function() {
    this._clearDelayTimeout();
    this._clearFrame();
    this._progress = 0;
    this._previousTime = -1;
    domUtil.setTransform(this.$(), "translate3d(0, 0, 0)");

    if (!util.documentHidden.isBackgrounded()) {
        this._containerWidth = this.$container()[0].getBoundingClientRect().width;
        this._contentWidth = this.$()[0].getBoundingClientRect().width;
    }

    var scrollWidth = this._getScrollWidth();
    if (scrollWidth > 0) {
        this._startTimer();
    }
};

TrackDisplay.prototype.setTrack = function(track) {
    if (!track) return;
    if (this._currentTrack === track) return;
    if (this._currentTrack) {
        this._currentTrack.removeListener("indexChange", this._trackIndexChanged);
        this._currentTrack.removeListener("tagDataUpdate", this._trackDataUpdated);
    }
    this._currentTrack = track;
    this._currentTrack.on("indexChange", this._trackIndexChanged);
    this._currentTrack.on("tagDataUpdate", this._trackDataUpdated);
    this._updateText();
    this._reset();
};

module.exports = TrackDisplay;
