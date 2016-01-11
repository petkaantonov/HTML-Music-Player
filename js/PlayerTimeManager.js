"use strict";
const $ = require("../lib/jquery");

const keyValueDatabase = require("./KeyValueDatabase");
const util = require("./util");
const touch = require("./features").touch;
const domUtil = require("./DomUtil");

const DISPLAY_ELAPSED = 0;
const DISPLAY_REMAINING = 1;

const TIME_DISPLAY_PREFERENCE_KEY = "time-display";

function PlayerTimeManager(dom, player, opts) {
    opts = Object(opts);
    this._domNode = $(dom);
    this.player = player;
    this.displayMode = DISPLAY_ELAPSED;
    this.seeking = false;
    this.totalTime = 0;
    this.currentTime = 0;
    this.seekSlider = opts.seekSlider;
    this._displayedTimeRight = 0;
    this._displayedTimeLeft = 0;
    this._transitionEnabled = false;
    this._totalTimeDomNode = this.$().find(opts.totalTimeDom);
    this._currentTimeDomNode = this.$().find(opts.currentTimeDom);
    this._timeContainerDomNode = this.$().find(opts.timeContainerDom);
    this._timeProgressDomNode = this.$().find(opts.timeProgressDom);
    this._timeSeparatorDomNode = this.$().find(opts.timeSeparatorDom);
    this._updateProgress = this._updateProgress.bind(this);
    this.hidden = true;

    this.slideBegun = this.slideBegun.bind(this);
    this.slideEnded = this.slideEnded.bind(this);
    this.slided = this.slided.bind(this);
    this.playerTimeProgressed = this.playerTimeProgressed.bind(this);
    this.containerClicked = this.containerClicked.bind(this);
    this.newTrackLoaded = this.newTrackLoaded.bind(this);

    this.seekSlider.on("slideBegin", this.slideBegun);
    this.seekSlider.on("slideEnd", this.slideEnded);
    this.seekSlider.on("slide", this.slided);
    this.player.on("progress", this.playerTimeProgressed);
    this.player.on("newTrackLoad", this.newTrackLoaded);

    this.$timeContainer().click(this.containerClicked);

    if (touch) {
        this.$timeContainer().on("touchstart touchend", domUtil.tapHandler(this.containerClicked));
    }

    var self = this;
    keyValueDatabase.getInitialValues().then(function(values) {
        if (TIME_DISPLAY_PREFERENCE_KEY in values) {
            self.displayMode = values[TIME_DISPLAY_PREFERENCE_KEY];
        }
    });

    this.frameId = requestAnimationFrame(this._updateProgress);
}


PlayerTimeManager.prototype.$timeSeparator = function() {
    return this._timeSeparatorDomNode;
};

PlayerTimeManager.prototype.$timeProgress = function() {
    return this._timeProgressDomNode;
};

PlayerTimeManager.prototype.$timeContainer = function() {
    return this._timeContainerDomNode;
};

PlayerTimeManager.prototype.$currentTime = function() {
    return this._currentTimeDomNode;
};

PlayerTimeManager.prototype.$totalTime = function() {
    return this._totalTimeDomNode;
};

PlayerTimeManager.prototype.$ = function() {
    return this._domNode;
};

PlayerTimeManager.prototype.enableSeeking = function() {
    this.seeking = true;
};

PlayerTimeManager.prototype.disableSeeking = function() {
    this.seeking = false;
};

PlayerTimeManager.prototype.slideBegun = function() {
    this.enableSeeking();
};

PlayerTimeManager.prototype.slideEnded = function(percentage) {
    this.disableSeeking();
    if (this.player.isStopped) return;
    var duration = this.player.getDuration();
    if (duration) {
        this.setCurrentTime(duration * percentage);
        this.player.seek(duration * percentage);
    }
};

PlayerTimeManager.prototype.slided = function(percentage) {
    if (this.player.isStopped) return;
    var duration = this.player.getDuration();
    if (duration) {
        this.setCurrentTime(duration * percentage);
    }
};

PlayerTimeManager.prototype.playerTimeProgressed = function(playedTime, totalTime) {
    if (this.seeking) return;
    this.setCurrentTime(playedTime);
    this.setTotalTime(totalTime);
};

PlayerTimeManager.prototype.setTotalTime = function(time) {
    this.checkVisibility(time);

    if (this.displayMode === DISPLAY_ELAPSED) {
        var totalTime = Math.floor(time);
        if (this._displayedTimeRight !== totalTime) {
            this.$totalTime().text(util.toTimeString(totalTime));
            this._displayedTimeRight = totalTime;
        }
    }

    this.totalTime = time;
};

PlayerTimeManager.prototype.setCurrentTime = function(time) {
    
    var currentTime = Math.floor(time);

    if (this._displayedTimeLeft !== currentTime) {
        this._displayedTimeLeft = currentTime;
        this.$currentTime().text(util.toTimeString(currentTime));
    }

    if (this.displayMode === DISPLAY_REMAINING) {
        var remainingTime = Math.floor(Math.max(0, this.totalTime - time));
        if (this._displayedTimeRight !== remainingTime) {
            this.$totalTime().text("-" + util.toTimeString(remainingTime));
            this._displayedTimeRight = remainingTime;
        }
    }
    
    this.currentTime = time;
};

const progressValues = new Array(1025);
for (var i = 0; i < progressValues.length; ++i) {
    var percentage = -((1 - (i / 1024)) * 100) + "%"
    progressValues[i] = util.internString("translate3d(" + percentage + ",0,0)");
}
PlayerTimeManager.prototype._updateProgress = function() {
    this.frameId = requestAnimationFrame(this._updateProgress);

    var transform;
    if (this.currentTime === 0 || this.totalTime === 0) {
        transform = progressValues[0];
    } else {
        var progressIndex = ((this.currentTime / this.totalTime * 1024)|0);
        transform = progressValues[progressIndex];
    }
    
    this.$timeProgress()[0].style.transform = transform;
};

PlayerTimeManager.prototype.forceUpdate = function() {
    var currentTime = this.currentTime;
    var totalTime = this.totalTime;
    this.currentTime = currentTime + 1;
    this.totalTime = totalTime + 1;
    this.setTotalTime(totalTime);
    this.setCurrentTime(currentTime);
};

PlayerTimeManager.prototype.toggleDisplayMode = function() {
    if (this.displayMode === DISPLAY_ELAPSED) {
        this.displayMode = DISPLAY_REMAINING;
    } else {
        this.displayMode = DISPLAY_ELAPSED;
    }
    keyValueDatabase.set(TIME_DISPLAY_PREFERENCE_KEY, this.displayMode);
    this.forceUpdate();
};

PlayerTimeManager.prototype.containerClicked = function() {
    this.toggleDisplayMode();
};

PlayerTimeManager.prototype.hide = function() {
    if (this.hidden) return;
    this.hidden = true;
    this.$currentTime().parent().addClass("hidden");
    this.$totalTime().parent().addClass("hidden");
};

PlayerTimeManager.prototype.show = function() {
    if (!this.hidden) return;
    this.hidden = false;
    this.$currentTime().parent().removeClass("hidden");
    this.$totalTime().parent().removeClass("hidden");
};

PlayerTimeManager.prototype.checkVisibility = function(duration) {
    if (duration === 0) {
        this.hide();
    } else {
        this.show();
    }
};

PlayerTimeManager.prototype.newTrackLoaded = function() {
    if (this.seeking) return;
    var duration = Math.max(this.player.getProbableDuration() || 0, 0);
    this.checkVisibility(duration);
    this.setTotalTime(duration);
    this.currentTime = -1;
    this.setCurrentTime(0);
};

module.exports = PlayerTimeManager;
