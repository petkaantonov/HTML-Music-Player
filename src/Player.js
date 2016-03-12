"use strict";
import $ from "lib/jquery";
import Promise from "lib/bluebird";

const MINIMUM_DURATION = 3;
import AudioPlayer from "audio/AudioPlayerAudioBufferImpl";
import AudioVisualizer from "audio/AudioVisualizer";
import effects from "effects";
import crossfading from "crossfading";
import EventEmitter from "lib/events";
import { documentHidden, inherits } from "lib/util";
import { gestureEducation, makeTooltip, rippler } from "ui/GlobalUi";
import keyValueDatabase from "KeyValueDatabase";
import Track from "Track";
import { touch as touch } from "features";
import { TOUCH_EVENTS, isTouchEvent, tapHandler } from "lib/DomUtil";

var audioCtx;
const audioPlayer = new AudioPlayer(null, 20);
audioCtx = audioPlayer.getAudioContext();
const SILENT_BUFFER = audioCtx.createBuffer(audioCtx.destination.channelCount, 8192, audioCtx.sampleRate);

const PAUSE_RESUME_FADE_TIME = 0.37;
const RESUME_FADE_CURVE = new Float32Array([0, 1]);
const PAUSE_FADE_CURVE = new Float32Array([1, 0]);

const SEEK_START_CURVE = new Float32Array([1, 0.001]);
const SEEK_END_CURVE = new Float32Array([0.001, 1]);
const SEEK_START_FADE_TIME = audioPlayer.blockSizedTime(0.5);
const SEEK_END_FADE_TIME = audioPlayer.blockSizedTime(0.5);

const VOLUME_RATIO = 2;

effects.on("effectsChange", function() {
    Promise.resolve(audioPlayer.ready).then(function() {
        audioPlayer.setEffects(effects.getAudioPlayerEffects());
    });
});

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
    this.currentTime = 0;
    this.sourceNode = null;
    this.pauseResumeFadeGain = null;
    this.replayGain = null;
    this.seekGain = null;
    this.volumeGain = null;
    this.muteGain = null;
    this.fadeInGain = null;
    this.fadeOutGain = null;
    this.filterNodes = [];
    this.visualizer = null;

    this.timeUpdated = this.timeUpdated.bind(this);
    this.ended = this.ended.bind(this);
    this.errored = this.errored.bind(this);
    this.effectsChanged = this.effectsChanged.bind(this);
    this.crossFadingChanged = this.crossFadingChanged.bind(this);
    this.nextTrackChanged = this.nextTrackChanged.bind(this);
    this.trackTagDataUpdated = this.trackTagDataUpdated.bind(this);
    this.willSeek = this.willSeek.bind(this);
    this.didSeek = this.didSeek.bind(this);
    this.initialPlaythrough = this.initialPlaythrough.bind(this);
    this.lastBufferQueued = this.lastBufferQueued.bind(this);
    this.nextTrackChangedWhilePreloading = this.nextTrackChangedWhilePreloading.bind(this);

    track.on("tagDataUpdate", this.trackTagDataUpdated);
    effects.on("effectsChange", this.effectsChanged);
    crossfading.on("crossFadingChange", this.crossFadingChanged);
    player.playlist.on("nextTrackChange", this.nextTrackChanged);

    this.sourceNode = audioPlayer.createSourceNode();
    this.sourceNode.on("lastBufferQueued", this.lastBufferQueued);
    this.sourceNode.setVolume(1);
    this.sourceNode.pause();
    this.setupNodes();
}

AudioManager.prototype.setupNodes = function() {
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
    this.muteGain.gain.value = this.player.isMuted() ? 0 : 1;
    this.volumeGain.gain.value = this.player.getVolume() * VOLUME_RATIO;

    this.visualizer = new AudioVisualizer(audioCtx, this.sourceNode, this.player.visualizerCanvas, {
        baseSmoothingConstant: 0.00042,
        maxFrequency: 12500,
        minFrequency: 20,
        multiplier: this.replayGain.gain.value
    });

    this.sourceNode.node().connect(this.pauseResumeFadeGain);
    this.pauseResumeFadeGain.connect(this.replayGain);
    this.connectEqualizer(effects.getEqualizerSetup(this.track));
    this.volumeGain.connect(this.seekGain);
    this.seekGain.connect(this.muteGain);
    this.muteGain.connect(this.fadeInGain);
    this.fadeInGain.connect(this.fadeOutGain);
    this.fadeOutGain.connect(audioCtx.destination);
    this.intendingToSeek = -1;
};

AudioManager.prototype.destroyVisualizer = function() {
    if (this.visualizer) {
        this.visualizer.destroy();
        this.visualizer = null;
    }
};

// The track is only used for fade out and this audiomanager is otherwise
// obsolete.
AudioManager.prototype.background = function() {
    this.destroyVisualizer();
};

AudioManager.prototype.audioContextReset = function() {
    if (this.destroyed) return;
    this.destroyVisualizer();
    this.setupNodes();
    this.normalizeLoudness();
};

AudioManager.prototype.hasGaplessPreload = function() {
    if (this.sourceNode.hasGaplessPreload()) return true;

    if (this.track.hasSilenceAtEnd() &&
        this.player.getFadeInTimeForNextTrack() === 0 &&
        !this.gaplessPreloadTrack) {
        return this.getCurrentTime() >= this.getDuration();
    }
    return false;
};

AudioManager.prototype._updateNextGaplessTrack = function() {
    this.gaplessPreloadTrack = this.player.playlist.getNextTrack();
    if (this.gaplessPreloadTrack) {
        var time = this.gaplessPreloadTrack.convertFromSilenceAdjustedTime(0);
        this.sourceNode.replace(this.gaplessPreloadTrack.getFile(),
                                time,
                                true,
                                this.gaplessPreloadTrack.playerMetadata());
    }
};

AudioManager.prototype.nextTrackChangedWhilePreloading = function() {
    this._updateNextGaplessTrack();
};

AudioManager.prototype.isSeekable = function() {
    return !this.destroyed && this.sourceNode.isSeekable();
};

AudioManager.prototype.lastBufferQueued = function() {
    var shouldPreload = this.player.currentAudioManager === this &&
                        this.player.playlist.getNextTrack() &&
                        this.player.getFadeInTimeForNextTrack() === 0 &&
                        // When track has silence at end, preloading will be done during it.
                        !this.track.hasSilenceAtEnd() &&
                        !this.gaplessPreloadTrack;


    if (shouldPreload) {
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
            this.intendingToSeek = -1;
            this.track.removeListener("tagDataUpdate", this.trackTagDataUpdated);
            this.track = track;
            this.track.on("tagDataUpdate", this.trackTagDataUpdated);
            this.normalizeLoudness();
            this.sourceNode.replaceUsingGaplessPreload();
            this.updateSchedules();
            return;
        }
    }

    this.fadeOutSeekGain();
    this.intendingToSeek = 0;
    this.player.audioManagerSeekIntent(this, 0);
    var self = this;
    this.track.removeListener("tagDataUpdate", this.trackTagDataUpdated);
    this.track = track;
    this.track.on("tagDataUpdate", this.trackTagDataUpdated);
    this.implicitlyLoaded = false;
    this.sourceNode.removeAllListeners("replacementLoaded");
    this.sourceNode.once("replacementLoaded", function() {
        self.intendingToSeek = -1;
        if (self.destroyed || self.player.currentAudioManager !== self) return;
        self.normalizeLoudness();
        self.updateSchedules();
        self.resume();
        self.fadeInSeekGain();
    });
    this.currentTime = track.convertFromSilenceAdjustedTime(0);
    this.sourceNode.replace(track.getFile(), this.currentTime, false, track.playerMetadata());
};

AudioManager.prototype.nextTrackChanged = function() {
    if (this.destroyed) return;
    this.updateSchedules();
};

AudioManager.prototype.trackTagDataUpdated = function() {
    if (this.destroyed || this.player.currentAudioManager !== this) return;
    this.player.getPictureManager().updateImageFromTrack(this.track);
    this.normalizeLoudness();
};

AudioManager.prototype.normalizeLoudness = function() {
    if (this.destroyed) return;
    var track = this.track;
    var replayGain = effects.decibelChangeToAmplitudeRatio(
        track.getTrackGain() || track.getAlbumGain() || -6);

    if (track.getTrackPeak() > 1) {
        replayGain = (1 / track.getTrackPeak()) * replayGain;
    }

    this.replayGain.gain.value = replayGain;
    if (this.visualizer) {
        this.visualizer.setMultiplier(replayGain);
    }
};

AudioManager.prototype.getImage = function() {
    return this.track.getImage();
};

AudioManager.prototype.effectsChanged = function() {
    if (this.destroyed) return;
    this.connectEqualizer(effects.getEqualizerSetup(this.track));
};

AudioManager.prototype.crossFadingChanged = function() {
    if (this.destroyed) return;
    this.updateSchedules();
};

AudioManager.prototype.connectEqualizer = function(setup) {
    if (this.destroyed) return;
    try {
        this.replayGain.disconnect();
    } catch (e) {}

    this.filterNodes.forEach(function(node) {
        try {
            node.disconnect();
        } catch (e) {}
    });

    var nodes = [];
    var specs = setup.specs;
    var gains = setup.gains;

    for (var i = 0; i < gains.length; ++i) {
        var gain = gains[i];
        if (gain !== 0) {
            var spec = specs[i];
            var node = audioCtx.createBiquadFilter();
            node.type = spec[1];
            node.Q.value = 1;
            node.frequency.value = spec[0];
            node.gain.value = gain;
            nodes.push(node);
        }
    }
    this.filterNodes = nodes;

    if (!nodes.length) {
        this.replayGain.connect(this.volumeGain);
    } else {
        var lastFilter = nodes.reduce(function(prev, curr) {
            prev.connect(curr);
            return curr;
        }, this.replayGain);

        lastFilter.connect(this.volumeGain);
    }
};

AudioManager.prototype.setCurrentTime = function(currentTime) {
    if (this.destroyed) return;
    this.currentTime = currentTime;
    var rawTime = this.track.convertFromSilenceAdjustedTime(currentTime);
    this.sourceNode.setCurrentTime(rawTime);
};

AudioManager.prototype.getCurrentTime = function() {
    if (this.destroyed) return 0;
    this.currentTime = this.track.convertToSilenceAdjustedTime(this.sourceNode.getCurrentTime());
    return this.currentTime;
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
        if (self.visualizer) {
            self.visualizer.pause();
        }
    }).finally(function() {
        self.pauseResumeFadePromise  = null;
    });
};

AudioManager.prototype.resume = function() {
    if (this.destroyed || !this.started) return;
    var now = audioCtx.currentTime;
    this.cancelPauseResumeFade();
    this.sourceNode.play();
    if (this.visualizer) {
        this.visualizer.resume();
    }
    this.pauseResumeFadeGain.gain.cancelScheduledValues(0);
    this.pauseResumeFadeGain.gain.setValueCurveAtTime(
        RESUME_FADE_CURVE, now, PAUSE_RESUME_FADE_TIME);
};

AudioManager.prototype.start = function() {
    if (this.destroyed || this.started) return;
    this.intendingToSeek = -1;
    this.started = true;
    this.normalizeLoudness();
    this.sourceNode.on("timeUpdate", this.timeUpdated);
    this.sourceNode.on("ended", this.ended);
    this.sourceNode.on("error", this.errored);
    this.sourceNode.on("initialPlaythrough", this.initialPlaythrough);
    this.sourceNode.load(this.track.getFile(),
                         this.track.convertFromSilenceAdjustedTime(0),
                         this.track.playerMetadata());
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
    this.seekGain.gain.value = 1;
    this.seekGain.gain.setValueCurveAtTime(SEEK_START_CURVE, now, SEEK_START_FADE_TIME);
};

AudioManager.prototype.fadeInSeekGain = function() {
    var now = audioCtx.currentTime;
    this.seekGain.gain.cancelScheduledValues(0);
    this.seekGain.gain.value = 0.001;
    this.seekGain.gain.setValueCurveAtTime(SEEK_END_CURVE, now, SEEK_END_FADE_TIME);
}

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
    this.volumeGain.gain.value = volume * VOLUME_RATIO;
};

AudioManager.prototype.getFadeInTime = function(track) {
    var crossFadePreferences = crossfading.getPreferences();
    var fadeInEnabled = crossFadePreferences.getInEnabled();

    if (!fadeInEnabled) return 0;

    if (!crossFadePreferences.getShouldAlbumCrossFade()) {
        if (this.player.playlist.getPreviousTrack() &&
            this.track.comesAfterInSameAlbum(this.player.playlist.getPreviousTrack())) {
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
        if (this.player.playlist.getNextTrack() &&
            this.track.comesBeforeInSameAlbum(this.player.playlist.getNextTrack())) {
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
    effects.removeListener("effectsChange", this.effectsChanged);
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
    this.destroyVisualizer();
    this.track.removeListener("tagDataUpdate", this.trackTagDataUpdated);
    this.seekGain = null;
    this.sourceNode = null;
    this.fadeInGain = null;
    this.fadeOutGain = null;
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
    this.effectsChanged =
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
const LATENCY_KEY = "audio-hardware-latency";

function Player(dom, playlist, opts) {
    var self = this;
    EventEmitter.call(this);
    opts = Object(opts);
    this.env = opts.env;
    this.db = opts.db;
    this.dbValues = opts.dbValues;
    this._domNode = $(dom);

    this._playButtonDomNode = this.$().find(opts.playButtonDom);
    this._previousButtonDomNode = this.$().find(opts.previousButtonDom);
    this._nextButtonDomNode = this.$().find(opts.nextButtonDom);

    this.visualizerCanvas = null;
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
    this.$next().click(this.nextButtonClicked.bind(this));
    this.$previous().click(this.prevButtonClicked.bind(this));

    if (touch) {
        this.$play().on(TOUCH_EVENTS, tapHandler(this.playButtonClicked.bind(this)));
        this.$next().on(TOUCH_EVENTS, tapHandler(this.nextButtonClicked.bind(this)));
        this.$previous().on(TOUCH_EVENTS, tapHandler(this.prevButtonClicked.bind(this)));
    }

    this._playTooltip = makeTooltip(this.$play(), function() {
        return self.isPlaying ? "Pause playback"
                            : self.isPaused ? "Resume playback" : "Start playback";
    });

    this._nextTooltip = makeTooltip(this.$next(), "Next track");
    this._previousTooltip = makeTooltip(this.$previous(), "Previous track");

    playlist.on("loadNeed", this.loadTrack.bind(this));
    playlist.on("playlistEmpty", this.stop.bind(this));
    playlist.on("nextTrackChange", this.nextTrackChanged);
    playlist.on("historyChange", this.historyChanged.bind(this));

    var self = this;
    keyValueDatabase.getInitialValues().then(function(values) {
        if (VOLUME_KEY in values) self.setVolume(values[VOLUME_KEY]);
        if (MUTED_KEY in values && values.muted) self.toggleMute();
        if (LATENCY_KEY in values) self.setAudioHardwareLatency(+values[LATENCY_KEY]);
    });

    this.ready = audioPlayer.ready.then(function() {
        self.ready = null;
    });
    this.initAudioContextPrimer(audioCtx);
    audioPlayer.on("audioContextReset", this.audioContextReset.bind(this));
}
inherits(Player, EventEmitter);

Player.prototype.audioContextReset = function() {
    audioCtx = audioPlayer.getAudioContext();
    this.initAudioContextPrimer(audioCtx);
    if (this.currentAudioManager) this.currentAudioManager.audioContextReset();
};

var unprimedAudioContext;
Player.prototype.initAudioContextPrimer = function(audioCtx) {
    unprimedAudioContext = audioCtx;
};

document.addEventListener("touchend", function(e) {
    if (unprimedAudioContext) {
        var audioCtx = unprimedAudioContext;
        try {
            audioCtx.resume().catch(function(){});
        } catch (e) {}

        var source = audioCtx.createBufferSource();
        source.buffer = SILENT_BUFFER;
        source.connect(audioCtx.destination);
        source.start(0);
        unprimedAudioContext = null;
    }
}, false);

Player.prototype.setVisualizerCanvas = function(value) {
    this.visualizerCanvas = value;
};

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
    if (audioManager === this.currentAudioManager) {
        this.currentAudioManager = null;
        if (!this.playlist.getCurrentTrack() &&
            !this.playlist.getNextTrack() &&
            this.isPlaying) {
            this.stop();
        }
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
    if (fadeInTime <= 0 || !preferences.getInEnabled()) return 0;

    var audioManager = this.currentAudioManager;

    if (!audioManager) return 0;

    var nextTrack = this.playlist.getNextTrack();
    if (!nextTrack) return 0;
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
    this.playlist.trackPlayedSuccessfully();
    this.nextTrackImplicitly();
};

Player.prototype.audioManagerEnded = function(audioManager, haveGaplessPreloadPending) {
    if (audioManager === this.currentAudioManager) {
        var alreadyFinished = haveGaplessPreloadPending && !audioManager.sourceNode.hasGaplessPreload();
        if (!haveGaplessPreloadPending) {
            audioManager.destroy();
        }

        if (!alreadyFinished) {
            this.trackFinished();
        }
    } else {
        audioManager.destroy();
    }
};

Player.prototype.audioManagerProgressed = function(audioManager) {
    if (audioManager === this.currentAudioManager) {
        var currentTime = audioManager.getCurrentTime();
        var totalTime = audioManager.getDuration();
        var fadeInTime = this.getFadeInTimeForNextTrack();

        if ((currentTime >= totalTime && totalTime > 0 && currentTime > 0) ||
            (fadeInTime > 0 && totalTime > 0 && currentTime > 0 && (totalTime - currentTime > 0) &&
            (totalTime - currentTime <= fadeInTime))) {
            this.trackFinished();
        } else if (this.isPlaying && !documentHidden.isBackgrounded()) {
            this.emit("progress", currentTime, totalTime);
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
    return Promise.resolve(null);
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
    if (this.ready && !this.ready.isResolved()) {
        var self = this;
        this.ready = this.ready.then(function() {
            self.loadTrack(track);
        });
        return;
    }

    this.isStopped = false;
    this.isPlaying = true;
    this.isPaused = false;

    var implicit = this.implicitLoading;
    if (implicit) {
        this.implicitLoading = false;
    } else {
        destroyAudioManagers(this.currentAudioManager);
    }

    // Should never be true but there are too many moving parts to figure it out.
    if (this.currentAudioManager && this.currentAudioManager.destroyed) {
        this.currentAudioManager = null;
    }

    if (this.currentAudioManager &&
        (!implicit || this.currentAudioManager.hasGaplessPreload())) {
        this.currentAudioManager.replaceTrack(track);
        this.startedPlay();
        this.emit("trackPlaying");
        this.emit("newTrackLoad");
        return;
    }

    if (this.currentAudioManager) {
        this.currentAudioManager.background();
    }
    this.currentAudioManager = new AudioManager(this, track, implicit);
    this.currentAudioManager.trackTagDataUpdated();
    this.startedPlay();
    this.emit("trackPlaying");
    this.emit("newTrackLoad");
    this.currentAudioManager.start();
};

Player.prototype.nextButtonClicked = function(e) {
    rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    this.playlist.next();
    if (isTouchEvent(e)) {
        gestureEducation("next");
    }
};

Player.prototype.prevButtonClicked = function(e) {
    rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    this.playlist.prev();
    if (isTouchEvent(e)) {
        gestureEducation("previous");
    }
};

Player.prototype.playButtonClicked = function(e) {
    rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    if (this.isPlaying) {
        this.pause();
    } else {
        this.play();
    }
    if (isTouchEvent(e)) {
        gestureEducation("playpause");
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

Player.prototype.togglePlayback = function() {
    if (!this.isStopped) {
        if (this.isPlaying) {
            this.pause();
        } else if (this.isPaused) {
            this.resume();
        }
    }
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

Player.prototype.getAudioHardwareLatency = function() {
    return audioPlayer.getHardwareLatency();
};

Player.prototype.setAudioHardwareLatency = function(value) {
    audioPlayer.setHardwareLatency(+value);
    keyValueDatabase.set(LATENCY_KEY, audioPlayer.getHardwareLatency());
};

Player.prototype.getMaximumAudioHardwareLatency = function() {
    return audioPlayer.getMaxLatency();
};

module.exports = Player;
