"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird.js");

const MINIMUM_DURATION = 3;
const AudioPlayer = require("./AudioPlayerAudioBufferImpl");
const AudioVisualizer = require("./AudioVisualizer");
const equalizer = require("./equalizer");
const crossfading = require("./crossfading");
const EventEmitter = require("events");
const util = require("./util");
const GlobalUi = require("./GlobalUi");
const keyValueDatabase = require("./KeyValueDatabase");
const Track = require("./Track");

const audioCtx = (function() {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    return new AudioContext();
})();
const audioPlayer = new AudioPlayer(audioCtx);

const PAUSE_RESUME_FADE_TIME = 0.37;
const RESUME_FADE_CURVE = new Float32Array([0, 1]);
const PAUSE_FADE_CURVE = new Float32Array([1, 0]);

const SEEK_START_CURVE = new Float32Array([1, 0.0]);
const SEEK_END_CURVE = new Float32Array([0.0, 1]);
const SEEK_START_FADE_TIME = audioPlayer.blockSizedTime(0.04);
const SEEK_END_FADE_TIME = audioPlayer.blockSizedTime(0.065);

const audioManagers = [];
// Supports deletion mid-iteration.
function forEachAudioManager(fn) {
    var currentLength = audioManagers.length;
    for (var i = 0; i < audioManagers.length; ++i) {
        fn(audioManagers[i], i, audioManagers);
        // Deleted from the array.
        if (currentLength > audioManagers.length) {
            i -= (currentLength - audioManagers.length);
            currentLength = audioManagers.length;
        }
    }
}

function destroyAudioManagers(exceptThisOne) {
    forEachAudioManager(function(am) {
        if (am !== exceptThisOne) {
            am.destroy();
        }
    });
}

function AudioManager(player, track, implicitlyLoaded) {    
    audioManagers.push(this);
    this.gaplessPreloadTrack = null;
    this.implicitlyLoaded = implicitlyLoaded;
    this.player = player;
    this.destroyed = false;
    this.intendingToSeek = -1;
    this.track = track;
    this.sourceNode = audioPlayer.createSourceNode();
    
    this.sourceNode.setVolume(1);
    this.setCurrentTime(0);
    this.sourceNode.pause();

    this.pauseResumeFadeGain = audioCtx.createGain();
    this.replayGain = audioCtx.createGain();
    this.seekGain = audioCtx.createGain();
    this.volumeGain = audioCtx.createGain();
    this.muteGain = audioCtx.createGain();
    this.fadeInGain = audioCtx.createGain();
    this.fadeOutGain = audioCtx.createGain();

    this.filterNodes = [];

    this.pauseResumeFadeGain.gain.value = 1;
    this.pauseResumeFadePromise = null;
    this.muteGain.gain.value = player.isMuted() ? 0 : 1;
    this.volumeGain.gain.value = player.getVolume();

    this.visualizer = new AudioVisualizer(audioCtx, this.sourceNode, this.player.visualizerCanvas, {
        baseSmoothingConstant: 0.0007,
        maxFrequency: 12500,
        minFrequency: 20,
        multiplier: this.replayGain.gain.value
    });

    this.sourceNode.node().connect(this.pauseResumeFadeGain);
    this.pauseResumeFadeGain.connect(this.replayGain);
    this.connectEqualizerFilters(equalizer.getBands(this.track));
    this.volumeGain.connect(this.seekGain);
    this.seekGain.connect(this.muteGain);
    this.muteGain.connect(this.fadeInGain);
    this.fadeInGain.connect(this.fadeOutGain);
    this.fadeOutGain.connect(audioCtx.destination);

    this.timeUpdated = this.timeUpdated.bind(this);
    this.ended = this.ended.bind(this);
    this.errored = this.errored.bind(this);
    this.equalizerChanged = this.equalizerChanged.bind(this);
    this.crossFadingChanged = this.crossFadingChanged.bind(this);
    this.nextTrackChanged = this.nextTrackChanged.bind(this);
    this.trackTagDataUpdated = this.trackTagDataUpdated.bind(this);
    this.willSeek = this.willSeek.bind(this);
    this.didSeek = this.didSeek.bind(this);
    this.initialPlaythrough = this.initialPlaythrough.bind(this);
    this.lastBufferQueued = this.lastBufferQueued.bind(this);
    this.nextTrackChangedWhilePreloading = this.nextTrackChangedWhilePreloading.bind(this);

    track.on("tagDataUpdate", this.trackTagDataUpdated);
    equalizer.on("equalizerChange", this.equalizerChanged);
    crossfading.on("crossFadingChange", this.crossFadingChanged);
    player.playlist.on("nextTrackChange", this.nextTrackChanged);
    this.sourceNode.on("lastBufferQueued", this.lastBufferQueued);
}

AudioManager.prototype._updateNextGaplessTrack = function() {
    this.gaplessPreloadTrack = this.player.playlist.getNextTrack();
    var time = this.gaplessPreloadTrack.getSilenceAdjustedDuration(0);
    this.sourceNode.replace(this.gaplessPreloadTrack.getFile(), time, true);
};

AudioManager.prototype.nextTrackChangedWhilePreloading = function() {
    this._updateNextGaplessTrack();
};

AudioManager.prototype.isSeekable = function() {
    return !this.destroyed && this.sourceNode.isSeekable();
};

AudioManager.prototype.lastBufferQueued = function() {
    var gaplessPossible = this.player.currentAudioManager === this &&
                          this.player.playlist.getNextTrack() &&
                          this.player.getFadeInTimeForNextTrack() === 0 &&
                          !this.gaplessPreloadTrack;


    if (gaplessPossible) {
        this.player.playlist.on("nextTrackChange", this.nextTrackChangedWhilePreloading);      
        this._updateNextGaplessTrack();
    }
};

AudioManager.prototype.replaceTrack = function(track) {
    if (this.destroyed || this.player.currentAudioManager !== this) return;
    this.player.playlist.removeListener("nextTrackChange", this.nextTrackChangedWhilePreloading);
    var gaplessPreloadTrack = this.gaplessPreloadTrack;
    this.gaplessPreloadTrack = null;

    if (this.sourceNode.hasGaplessPreload()) {
        if (track === gaplessPreloadTrack) {
            this.track.removeListener("tagDataUpdate", this.trackTagDataUpdated);
            this.track = track;
            this.track.on("tagDataUpdate", this.trackTagDataUpdated);
            this.normalizeLoudness();
            this.sourceNode.replaceUsingGaplessPreload();
            this.updateSchedules();
            return;
        }
    }

    if (track === this.track) {
        this.resume();
        return this.setCurrentTime(0);
    }

    this.fadeOutSeekGain();
    var time = track.convertToSilenceAdjustedTime(0);
    this.intendingToSeek = time;
    this.player.audioManagerSeekIntent(this, time);
    var self = this;
    this.track.removeListener("tagDataUpdate", this.trackTagDataUpdated);
    this.track = track;
    this.track.on("tagDataUpdate", this.trackTagDataUpdated);
    this.implicitlyLoaded = false;
    this.sourceNode.removeAllListeners("replacementLoaded");
    this.sourceNode.once("replacementLoaded", function() {
        if (self.destroyed || self.player.currentAudioManager !== self) return;
        self.intendingToSeek = -1;
        self.normalizeLoudness();
        self.updateSchedules();
        self.resume();
        self.fadeInSeekGain();
    });
    this.sourceNode.replace(track.getFile(), time);
};

AudioManager.prototype.nextTrackChanged = function() {
    if (this.destroyed) return;
    this.updateSchedules();
};

AudioManager.prototype.trackTagDataUpdated = function() {
    if (this.destroyed || this.player.currentAudioManager !== this) return;
    var track = this.track;

    if (track.hasNonDefaultImage()) {
        this.player.getPictureManager().updateImage(track.getImage());
    }

    this.normalizeLoudness();
};

AudioManager.prototype.normalizeLoudness = function() {
    if (this.destroyed) return;
    var track = this.track;
    var replayGain = equalizer.decibelChangeToAmplitudeRatio(
        track.getTrackGain() || track.getAlbumGain() || -6);

    if (track.getTrackPeak() * replayGain > 1) {
        replayGain = (1 / track.getTrackPeak()) * replayGain;
    }

    this.replayGain.gain.value = replayGain;
    this.visualizer.setMultiplier(replayGain);
};

AudioManager.prototype.getImage = function() {
    return this.track.getImage();
};

AudioManager.prototype.equalizerChanged = function() {
    if (this.destroyed) return;
    this.connectEqualizerFilters(equalizer.getBands(this.track));
};

AudioManager.prototype.crossFadingChanged = function() {
    if (this.destroyed) return;
    this.updateSchedules();
};

AudioManager.prototype.connectEqualizerFilters = function(bands) {
    if (this.destroyed) return;
    this.replayGain.disconnect();
    this.filterNodes.forEach(function(node) {
        node.disconnect();
    });

    var bandsFrequencySorted = Object.keys(bands).map(function(key) {
        if (!isFinite(+key)) return null;
        return {
            frequency: +key,
            gain: bands[key]
        };
    }).filter(Boolean).sort(function(a, b) {
        return a.frequency - b.frequency;
    });

    var someBandHasGainOrAttenuation = bandsFrequencySorted.some(function(v) {
        return +v.gain !== 0;
    });

    // TODO: Only connect the bands that have gain or attenuation.
    if (someBandHasGainOrAttenuation) {
        var firstBand = bandsFrequencySorted.shift();
        var firstFilterNode = audioCtx.createBiquadFilter();
        firstFilterNode.type = "lowshelf";
        firstFilterNode.Q.value = 1;
        firstFilterNode.frequency.value = firstBand.frequency;
        firstFilterNode.gain.value = firstBand.gain;

        var lastBand = bandsFrequencySorted.pop();
        var lastFilterNode = audioCtx.createBiquadFilter();
        lastFilterNode.type = "highshelf";
        lastFilterNode.Q.value = 1;
        lastFilterNode.frequency.value = lastBand.frequency;
        lastFilterNode.gain.value = lastBand.gain;

        this.filterNodes = [firstFilterNode].concat(bandsFrequencySorted.map(function(band) {
            var filterNode = audioCtx.createBiquadFilter();
            filterNode.type = "peaking";
            filterNode.Q.value = 1;
            filterNode.frequency.value = band.frequency;
            filterNode.gain.value = band.gain;
            return filterNode;
        }), lastFilterNode);


        var lastFilter = this.filterNodes.reduce(function(prev, curr) {
            prev.connect(curr);
            return curr;
        }, this.replayGain);
        lastFilter.connect(this.volumeGain);
    } else {
        this.replayGain.connect(this.volumeGain);
    }
};

AudioManager.prototype.setCurrentTime = function(currentTime) {
    if (this.destroyed) return;
    this.sourceNode.setCurrentTime(this.track.convertFromSilenceAdjustedTime(currentTime));
};

AudioManager.prototype.getCurrentTime = function() {
    if (this.destroyed) return 0;
    return this.track.convertToSilenceAdjustedTime(this.sourceNode.getCurrentTime());
};

AudioManager.prototype.getDuration = function() {
    if (this.destroyed) return 0;
    return this.track.getSilenceAdjustedDuration(this.sourceNode.getDuration());
};

AudioManager.prototype.errored = function(e) {
    if (this.destroyed) return;
    this.player.audioManagerErrored(this, e);
};

AudioManager.prototype.ended = function(haveGaplessPreloadPending) {
    if (this.destroyed) return;
    this.player.playlist.removeListener("nextTrackChange", this.nextTrackChangedWhilePreloading);
    this.player.audioManagerEnded(this, haveGaplessPreloadPending);
};

AudioManager.prototype.seekIntent = function(value) {
    if (this.destroyed) return;
    this.intendingToSeek = value;
    this.player.audioManagerSeekIntent(this, this.intendingToSeek);
};

AudioManager.prototype.timeUpdated = function() {
    if (this.destroyed || this.intendingToSeek !== -1) return;
    if (this.getCurrentTime() >= this.getDuration()) {
        this.player.playlist.removeListener("nextTrackChange", this.nextTrackChangedWhilePreloading);
    }
    this.player.audioManagerProgressed(this);
};

AudioManager.prototype.pause = function() {
    if (this.destroyed || !this.started) return;
    var now = audioCtx.currentTime;
    this.cancelPauseResumeFade();
    this.pauseResumeFadeGain.gain.cancelScheduledValues(0);
    this.pauseResumeFadeGain.gain.setValueCurveAtTime(
        PAUSE_FADE_CURVE, now, PAUSE_RESUME_FADE_TIME);
    var self = this;
    this.pauseResumeFadePromise = Promise.delay(PAUSE_RESUME_FADE_TIME * 1000).then(function() {
        if (self.destroyed) return;
        self.sourceNode.pause();
        self.visualizer.pause();
    }).finally(function() {
        self.pauseResumeFadePromise  = null;
    });
};

AudioManager.prototype.resume = function() {
    if (this.destroyed || !this.started) return;
    var now = audioCtx.currentTime;
    this.cancelPauseResumeFade();
    this.sourceNode.play();
    this.visualizer.resume();
    this.pauseResumeFadeGain.gain.cancelScheduledValues(0);
    this.pauseResumeFadeGain.gain.setValueCurveAtTime(
        RESUME_FADE_CURVE, now, PAUSE_RESUME_FADE_TIME);
};

AudioManager.prototype.start = function() {
    if (this.destroyed || this.started) return;
    this.started = true;
    this.normalizeLoudness();
    this.sourceNode.on("timeUpdate", this.timeUpdated);
    this.sourceNode.on("ended", this.ended);
    this.sourceNode.on("error", this.errored);
    this.sourceNode.on("initialPlaythrough", this.initialPlaythrough);
    this.sourceNode.load(this.track.getFile());
    this.sourceNode.play();
};

AudioManager.prototype.initialPlaythrough = function() {
    this.updateSchedules(!this.implicitlyLoaded);
    this.sourceNode.on("seeking", this.willSeek);
    this.sourceNode.on("seekComplete", this.didSeek);
};

AudioManager.prototype.fadeOutSeekGain = function() {
    var now = audioCtx.currentTime;
    this.seekGain.gain.cancelScheduledValues(0);
    this.seekGain.gain.setValueCurveAtTime(SEEK_START_CURVE, now, SEEK_START_FADE_TIME);
};

AudioManager.prototype.fadeInSeekGain = function() {
    var now = audioCtx.currentTime;
    this.seekGain.gain.cancelScheduledValues(0);
    this.seekGain.gain.setValueCurveAtTime(SEEK_END_CURVE, now, SEEK_END_FADE_TIME);
};

AudioManager.prototype.willSeek = function() {
    this.intendingToSeek = -1;
    if (this.destroyed) return;
    this.fadeOutSeekGain();
};

AudioManager.prototype.didSeek = function() {
    if (this.destroyed) return;
    this.intendingToSeek = -1;
    this.updateSchedules(true);
    this.fadeInSeekGain();
};

AudioManager.prototype.mute = function() {
    if (this.destroyed) return;
    var now = audioCtx.currentTime;
    this.muteGain.gain.cancelScheduledValues(0);
    this.muteGain.gain.setValueCurveAtTime(PAUSE_FADE_CURVE, now, PAUSE_RESUME_FADE_TIME);
};

AudioManager.prototype.unmute = function() {
    if (this.destroyed) return;
    var now = audioCtx.currentTime;
    this.muteGain.gain.cancelScheduledValues(0);
    this.muteGain.gain.setValueCurveAtTime(RESUME_FADE_CURVE, now, PAUSE_RESUME_FADE_TIME);
};

AudioManager.prototype.seek = function(time) {
    if (this.destroyed || !this.started) return;
    this.intendingToSeek = -1;
    this.setCurrentTime(time);
};

AudioManager.prototype.updateVolume = function(volume) {
    if (this.destroyed) return;
    this.volumeGain.gain.value = volume;
};

AudioManager.prototype.getFadeInTime = function(track) {
    var crossFadePreferences = crossfading.getPreferences();
    var fadeInEnabled = crossFadePreferences.getInEnabled();

    if (!fadeInEnabled) return 0;

    if (!crossFadePreferences.getShouldAlbumCrossFade()) {
        if (this.track.comesAfterInSameAlbum(this.player.playlist.getPreviousTrack())) {
            return 0;
        }
    }

    var duration = this.getDuration();
    return Math.max(0, Math.min(crossFadePreferences.getInTime(),
            duration - MINIMUM_DURATION - crossFadePreferences.getOutTime()));
};

AudioManager.prototype.getFadeOutTime = function() {
    var crossFadePreferences = crossfading.getPreferences();
    var fadeOutEnabled = crossFadePreferences.getOutEnabled();

    if (!fadeOutEnabled) return 0;

    if (!crossFadePreferences.getShouldAlbumCrossFade()) {
        if (this.track.comesBeforeInSameAlbum(this.player.playlist.getNextTrack())) {
            return 0;
        }
    }

    var duration = this.getDuration();
    return Math.max(0, Math.min(crossFadePreferences.getOutTime(),
            duration - MINIMUM_DURATION - crossFadePreferences.getInTime()));
};

AudioManager.prototype.updateSchedules = function(forceReset) {
    if (this.destroyed) return;
    var now = audioCtx.currentTime;
    var trackCurrentTime = this.getCurrentTime();
    var trackDuration = this.getDuration();
    this.fadeInGain.gain.cancelScheduledValues(0);
    this.fadeOutGain.gain.cancelScheduledValues(0);
    this.fadeInGain.gain.value = 1;
    this.fadeOutGain.gain.value = 1;

    var crossFadePreferences = crossfading.getPreferences();
    var fadeInTime = this.getFadeInTime();
    var fadeOutTime = this.getFadeOutTime();
    var fadeInSamples = crossFadePreferences.getInCurveSamples();
    var fadeOutSamples = crossFadePreferences.getOutCurveSamples();


    if (fadeInTime > 0 && this.implicitlyLoaded && !forceReset) {
        var audioCtxTime = now - trackCurrentTime;
        if (audioCtxTime > 0) {
            this.fadeInGain.gain.setValueCurveAtTime(fadeInSamples, audioCtxTime, fadeInTime);
        }
    }

    if (fadeOutTime > 0) {
        var trackCurrentTimeForFadeOut = trackDuration - fadeOutTime;
        var secondsUntilFadeOut = trackCurrentTimeForFadeOut - trackCurrentTime;
        var audioCtxTime = Math.max(0, now + secondsUntilFadeOut);
        this.fadeOutGain.gain.setValueCurveAtTime(fadeOutSamples, audioCtxTime, fadeOutTime);
    }

};

AudioManager.prototype.cancelPauseResumeFade = function() {
    if (this.pauseResumeFadePromise) {
        this.pauseResumeFadePromise.cancel();
        this.pauseResumeFadePromise = null;
    }
};

AudioManager.prototype.getVisualizer = function() {
    if (this.destroyed || !this.started) return null;
    return this.visualizer;
};

AudioManager.prototype.destroy = function() {
    if (this.destroyed) return;
    equalizer.removeListener("equalizerChange", this.equalizerChanged);
    crossfading.removeListener("crossFadingChange", this.crossFadingChanged);
    this.player.playlist.removeListener("nextTrackChange", this.nextTrackChanged);
    this.player.playlist.removeListener("nextTrackChange", this.nextTrackChangedWhilePreloading);
    this.sourceNode.removeListener("lastBufferQueued", this.lastBufferQueued);
    this.filterNodes.forEach(function(node) {
        node.disconnect();
    });
    this.pauseResumeFadeGain.disconnect();
    this.muteGain.disconnect();
    this.seekGain.disconnect();
    this.volumeGain.disconnect();
    this.fadeInGain.disconnect();
    this.fadeOutGain.disconnect();
    this.sourceNode.destroy();
    this.visualizer.destroy();
    this.track.removeListener("tagDataUpdate", this.trackTagDataUpdated);
    this.seekGain = null;
    this.sourceNode = null;
    this.fadeInGain = null;
    this.fadeOutGain = null;
    this.visualizer = null;
    this.volumeGain = null;
    this.muteGain = null;
    this.pauseResumeFadeGain = null;
    this.filterNodes = [];
    this.track = null;
    this.destroyed = true;
    this.gaplessPreloadTrack = null;

    this.timeUpdated = 
    this.ended = 
    this.errored = 
    this.equalizerChanged = 
    this.crossFadingChanged = 
    this.nextTrackChanged = 
    this.trackTagDataUpdated = 
    this.willSeek = 
    this.didSeek = 
    this.initialPlaythrough = null;

    var index = audioManagers.indexOf(this);
    if (index >= 0) {
        audioManagers.splice(index, 1);
    }
    this.player.audioManagerDestroyed(this);
    this.player = null;
};

const VOLUME_KEY = "volume";
const MUTED_KEY = "muted";

function Player(dom, playlist, opts) {
    var self = this;
    EventEmitter.call(this);
    opts = Object(opts);
    this._domNode = $(dom);

    this._playButtonDomNode = this.$().find(opts.playButtonDom);
    this._previousButtonDomNode = this.$().find(opts.previousButtonDom);
    this._nextButtonDomNode = this.$().find(opts.nextButtonDom);

    this.visualizerCanvas = opts.visualizerCanvas;
    this.currentAudioManager = null;
    this.volume = 0.15;
    this.isStopped = true;
    this.isPaused = false;
    this.isPlaying = false;
    this.isMutedValue = false;
    this.implicitLoading = false;
    this.playlist = playlist;
    this.queuedNextTrackImplicitly = false;
    this.pictureManager = null;

    this.nextTrackChanged = this.nextTrackChanged.bind(this);

    this.$play().click(this.playButtonClicked.bind(this));
    this.$next().click(playlist.next.bind(playlist));
    this.$previous().click(playlist.prev.bind(playlist));

    this._playTooltip = GlobalUi.makeTooltip(this.$play(), function() {
        return self.isPlaying ? "Pause playback"
                            : self.isPaused ? "Resume playback" : "Start playback";
    });

    this._nextTooltip = GlobalUi.makeTooltip(this.$next(), "Next track");
    this._previousTooltip = GlobalUi.makeTooltip(this.$previous(), "Previous track");

    playlist.on("loadNeed", this.loadTrack.bind(this));
    playlist.on("playlistEmpty", this.stop.bind(this));
    playlist.on("nextTrackChange", this.nextTrackChanged);
    playlist.on("historyChange", this.historyChanged.bind(this));

    var self = this;
    keyValueDatabase.getInitialValues().then(function(values) {
        if (VOLUME_KEY in values) self.setVolume(values.volume);
        if (MUTED_KEY in values && values.muted) self.toggleMute();
    });
}
util.inherits(Player, EventEmitter);

Player.prototype.$allButtons = function() {
    return this.$play().add(this.$previous())
                      .add(this.$next());
};

Player.prototype.$ = function() {
    return this._domNode;
};

Player.prototype.$play = function() {
    return this._playButtonDomNode;
};

Player.prototype.$previous = function() {
    return this._previousButtonDomNode;
};

Player.prototype.$next = function() {
    return this._nextButtonDomNode;
};

Player.prototype.historyChanged = function() {
    this.checkButtonState();
};

Player.prototype.setPictureManager = function(pictureManager) {
    this.pictureManager = pictureManager;
};

Player.prototype.getPictureManager = function() {
    return this.pictureManager;
};

Player.prototype.nextTrackChanged = function() {
    this.checkButtonState();

};

Player.prototype.audioManagerDestroyed = function(audioManager) {
    if (audioManager === this.currentAudioManager &&
        !this.playlist.getCurrentTrack() &&
        !this.playlist.getNextTrack() &&
        this.isPlaying) {
        this.stop();
    }
};

Player.prototype.nextTrackImplicitly = function() {
    if (this.isPaused) {
        if (this.queuedNextTrackImplicitly) return;
        this.queuedNextTrackImplicitly = true;
        var playId = this.playlist.getCurrentPlayId();
        var self = this;
        // Queue the next track load when the player resumes.
        this.once("trackPlaying", function() {
            this.queuedNextTrackImplicitly = false;
            // If it was exactly the same track playthrough that was resumed.
            if (!self.isPaused && self.playlist.getCurrentPlayId() === playId) {
                self.nextTrackImplicitly();
            }
        });
        return;
    }

    this.implicitLoading = true;
    if (!this.playlist.next()) {
        this.implicitLoading = false;
    }
};

Player.prototype.audioManagerErrored = function(audioManager, e) {
    if (audioManager.track) {
        var trackError;
        if (e.name === "NotFoundError" || e.name === "NotReadableError") {
            trackError = Track.FILESYSTEM_ACCESS_ERROR;
        } else {
            trackError = Track.DECODE_ERROR;
        }
        audioManager.track.setError(trackError);
    }
    destroyAudioManagers();
    this.currentAudioManager = null;
    this.nextTrackImplicitly();
};

Player.prototype.getProgress = function() {
    if (!this.currentAudioManager) return -1;
    var duration = this.currentAudioManager.getDuration();
    if (!duration) return -1;
    var currentTime = this.currentAudioManager.getCurrentTime();
    return Math.round((currentTime / duration) * 100) / 100;
};

Player.prototype.setProgress = function(p) {
    if (!this.currentAudioManager || !this.currentAudioManager.isSeekable()) return;
    p = Math.min(Math.max(p, 0), 1);
    var duration = this.currentAudioManager.getDuration();
    if (!duration) return;
    return this.seek(p * duration);
};

Player.prototype.seekIntent = function(p) {
    if (!this.currentAudioManager) return;
    p = Math.min(Math.max(p, 0), 1);
    var duration = this.currentAudioManager.getDuration();
    if (!duration) return;
    return this.seek(p * duration, true);
};

Player.prototype.getFadeInTimeForNextTrack = function() {
    var preferences = crossfading.getPreferences();
    var fadeInTime = preferences.getInTime();
    if (fadeInTime <= 0) return 0;

    var audioManager = this.currentAudioManager;

    if (!audioManager) return 0;

    var nextTrack = this.playlist.getNextTrack();
    if (!preferences.getShouldAlbumCrossFade() &&
        audioManager.track.comesBeforeInSameAlbum(nextTrack)) {
        return 0;
    }

    var duration = nextTrack.getBasicInfo().duration;

    return isNaN(duration) ? fadeInTime
                           : Math.max(Math.min(duration - MINIMUM_DURATION - preferences.getOutTime(), fadeInTime), 0);
};

Player.prototype.audioManagerSeekIntent = function(audioManager, time) {
    if (audioManager === this.currentAudioManager) {
        this.emit("progress", time, audioManager.getDuration());
    }
};

Player.prototype.trackFinished = function() {
    if (this.currentAudioManager &&
        this.currentAudioManager.track &&
        this.currentAudioManager.track.hasError()) {
        this.currentAudioManager.track.unsetError();
    }
    this.playlist.trackPlayedSuccessfully();
    this.nextTrackImplicitly();
};

Player.prototype.audioManagerEnded = function(audioManager, haveGaplessPreloadPending) {
    if (audioManager === this.currentAudioManager) {
        var alreadyFinished = haveGaplessPreloadPending && !audioManager.sourceNode.hasGaplessPreload();
        if (!alreadyFinished) {
            this.trackFinished();
        }

        if (!haveGaplessPreloadPending) {
            audioManager.destroy();
        }
    } else {
        audioManager.destroy();
    }
};

Player.prototype.audioManagerProgressed= function(audioManager) {
    if (audioManager === this.currentAudioManager) {
        var currentTime = audioManager.getCurrentTime();
        var totalTime = audioManager.getDuration();
        var fadeInTime = this.getFadeInTimeForNextTrack();

        this.emit("progress", currentTime, totalTime);

        if ((currentTime >= totalTime && totalTime > 0 && currentTime > 0) ||
            (fadeInTime > 0 && totalTime > 0 && currentTime > 0 && (totalTime - currentTime > 0) &&
            (totalTime - currentTime <= fadeInTime))) {
            this.trackFinished();
        }
    }
};

Player.prototype.getSampleRate = function() {
    var track = this.playlist.getCurrentTrack();
    if (!track) return 44100;
    var tagData = track.getTagData();
    if (!tagData) return 44100;
    return tagData.basicInfo.sampleRate;
};

Player.prototype.getImage = function() {
    if (this.currentAudioManager) {
        return this.currentAudioManager.getImage();
    }
    return null;
};

Player.prototype.pause = function() {
    if (!this.isPlaying) return this;
    this.isPaused = true;
    this.isStopped = false;
    this.isPlaying = false;
    forEachAudioManager(function(am) {
        am.pause();
    });
    this.pausedPlay();
};

Player.prototype.resume = function() {
    if (this.isPaused) {
        this.emit("trackPlaying");
        this.play();
    }
};

Player.prototype.play = function() {
    if (this.isPlaying) return this;

    if (!this.playlist.getCurrentTrack()) {
        this.playlist.playFirst();
        return this;
    }

    this.emit("trackPlaying");
    this.isPaused = false;
    this.isStopped = false;
    this.isPlaying = true;
    forEachAudioManager(function(am) {
        am.updateSchedules();
        am.resume();
    });
    this.startedPlay();
};

Player.prototype.stop = function() {
    if (this.isStopped) return this;
    this.isStopped = true;
    this.isPaused = false;
    this.isPlaying = false;
    this.currentAudioManager = null;
    destroyAudioManagers();
    this.playlist.stop();
    this.emit("progress", 0, 0);
    this.stoppedPlay();
};

Player.prototype.loadTrack = function(track) {
    this.isStopped = false;
    this.isPlaying = true;
    this.isPaused = false;

    var implicit = this.implicitLoading;
    if (implicit) {
        this.implicitLoading = false;
    } else {
        destroyAudioManagers(this.currentAudioManager);
    }

    if (this.currentAudioManager &&
        (!implicit || this.currentAudioManager.sourceNode.hasGaplessPreload())) {
        this.currentAudioManager.replaceTrack(track);
        this.startedPlay();
        this.emit("trackPlaying");
        this.emit("newTrackLoad");
        return;
    }
    this.currentAudioManager = new AudioManager(this, track, implicit);
    this.currentAudioManager.trackTagDataUpdated();
    this.startedPlay();
    this.emit("trackPlaying");
    this.emit("newTrackLoad");
    this.currentAudioManager.start();
};

Player.prototype.playButtonClicked = function() {
    if (this.isPlaying) {
        this.pause();
    } else {
        this.play();
    }
};

Player.prototype.checkButtonState = function() {
    this.$allButtons().addClass("disabled");

    if (this.playlist.getNextTrack()) {
        this.$next().removeClass("disabled");

        if (this.playlist.hasHistory()) {
            this.$previous().removeClass("disabled");
        }
    }

    if (!this.isStopped) {
        this.$play().removeClass("disabled");
        if (this.isPlaying) {
            this.$play()
                .find(".play-pause-morph-icon")
                .removeClass("play")
                .addClass("pause");
        } else if (this.isPaused) {
            this.$play()
                .find(".play-pause-morph-icon")
                .removeClass("pause")
                .addClass("play");
        }
    } else {
        this.$play().removeClass("active")
                .find(".play-pause-morph-icon")
                .removeClass("pause")
                .addClass("play");

        if (this.playlist.getNextTrack()) {
            this.$play().removeClass("disabled");
        }
    }

    this._playTooltip.refresh();
};

Player.prototype.startedPlay = function() {
    this.checkButtonState();
    this.emit("play");
};

Player.prototype.stoppedPlay = function() {
    this.checkButtonState();
    this.emit("stop");
};

Player.prototype.pausedPlay = function() {
    this.checkButtonState();
    this.emit("pause");
};

Player.prototype.seek = function(seconds, intent) {
    if (!this.isPlaying && !this.isPaused) return this;
    if (!this.currentAudioManager || !this.currentAudioManager.isSeekable()) return;
    var maxSeek = this.currentAudioManager.getDuration();
    if (!isFinite(maxSeek)) return;
    seconds = Math.max(0, Math.min(seconds, maxSeek));

    if (intent) {
        this.currentAudioManager.seekIntent(seconds);
    } else {
        this.currentAudioManager.seek(seconds);
    }
};

Player.prototype.isMuted = function() {
    return this.isMutedValue;
};

Player.prototype.toggleMute = function() {
    this.isMutedValue = !this.isMutedValue;
    if (this.isMutedValue) {
        this.emit("muted", true);
        forEachAudioManager(function(am) {
            am.mute();
        });
        keyValueDatabase.set(MUTED_KEY, true);
    } else {
        this.emit("muted", false);
        forEachAudioManager(function(am) {
            am.unmute();
        });
        keyValueDatabase.set(MUTED_KEY, false);
    }
};

Player.prototype.getDuration = function() {
    if (!this.currentAudioManager)
            throw new Error("cannot get duration no audioManager");
    return this.currentAudioManager.getDuration();
};

Player.prototype.getProbableDuration = function() {
    if (!this.currentAudioManager)
            throw new Error("cannot get duration no audioManager");
    var ret = this.currentAudioManager.getDuration();
    if (ret) return ret;
    var track = this.playlist.getCurrentTrack();
    if (track.tagData && track.tagData.basicInfo) {
        return track.getSilenceAdjustedDuration(track.tagData.basicInfo.duration || 0);
    }
};

Player.prototype.getVolume = function() {
    return this.volume;
};

Player.prototype.setVolume = function(val) {
    val = Math.min(Math.max(0, val), 1);
    var volume = this.volume = val;
    forEachAudioManager(function(am) {
        am.updateVolume(volume);
    });
    this.emit("volumeChange");
    keyValueDatabase.set(VOLUME_KEY, volume);
    return this;
};

module.exports = Player;
