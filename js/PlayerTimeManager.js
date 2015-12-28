"use strict";
const $ = require("../lib/jquery");

const keyValueDatabase = require("./KeyValueDatabase");
const util = require("./util");

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
    this._totalTimeDomNode = this.$().find(opts.totalTimeDom);
    this._currentTimeDomNode = this.$().find(opts.currentTimeDom);
    this._timeContainerDomNode = this.$().find(opts.timeContainerDom);
    this._timeProgressDomNode = this.$().find(opts.timeProgressDom);
    this._timeSeparatorDomNode = this.$().find(opts.timeSeparatorDom);
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


    var self = this;
    keyValueDatabase.getInitialValues().then(function(values) {
        if (TIME_DISPLAY_PREFERENCE_KEY in values) {
            self.displayMode = values[TIME_DISPLAY_PREFERENCE_KEY];
        }
    });
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
    time = Math.round(time);
    this.checkVisibility(time);
    if (time !== this.totalTime) {
        this.totalTime = time;
        if (this.displayMode === DISPLAY_ELAPSED) {
            this.$totalTime().text(util.toTimeString(time));
        }
        this.updateProgress();
    }
};

PlayerTimeManager.prototype.setCurrentTime = function(time) {
    time = Math.round(time);

    if (time !== this.currentTime) {
        this.currentTime = time;
        this.$currentTime().text(util.toTimeString(time));
        if (this.displayMode === DISPLAY_REMAINING) {
            time = Math.max(0, this.totalTime - time);
            this.$totalTime().text("-" + util.toTimeString(time));
        }
        this.updateProgress();
    }
};

PlayerTimeManager.prototype.updateProgress = function() {
    var progressPercentage = (this.currentTime / this.totalTime) || 0;
    var width = this.$timeProgress().width() + 5;
    this.$timeProgress().css("left", -(1 - progressPercentage) * width);
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
