"use strict";

import { Float32Array } from "platform/platform";
import AudioVisualizer from "visualization/AudioVisualizer";
import PlaythroughTickCounter from "player/PlaythroughTickCounter";

const PAUSE_RESUME_FADE_TIME = 0.37;
const RESUME_FADE_CURVE = new Float32Array([0, 1]);
const PAUSE_FADE_CURVE = new Float32Array([1, 0]);
const SEEK_START_CURVE = new Float32Array([1, 0.001]);
const SEEK_END_CURVE = new Float32Array([0.001, 1]);
const SEEK_START_FADE_TIME = 0.5;
const SEEK_END_FADE_TIME = 0.5;
const VOLUME_RATIO = 2;
const PLAYTHROUGH_COUNTER_THRESHOLD = 15;


export default function AudioManager(player, track, implicitlyLoaded) {
    this.gaplessPreloadTrack = null;
    this.implicitlyLoaded = implicitlyLoaded;
    this.player = player;
    this.destroyed = false;
    this.tickCounter = new PlaythroughTickCounter(PLAYTHROUGH_COUNTER_THRESHOLD);
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
    this.pauseResumeFadeRequestId = 0;

    this.timeUpdated = this.timeUpdated.bind(this);
    this.ended = this.ended.bind(this);
    this.errored = this.errored.bind(this);
    this.nextTrackChanged = this.nextTrackChanged.bind(this);
    this.trackTagDataUpdated = this.trackTagDataUpdated.bind(this);
    this.willSeek = this.willSeek.bind(this);
    this.didSeek = this.didSeek.bind(this);
    this.initialPlaythrough = this.initialPlaythrough.bind(this);
    this.lastBufferQueued = this.lastBufferQueued.bind(this);
    this.nextTrackChangedWhilePreloading = this.nextTrackChangedWhilePreloading.bind(this);

    this.track.on("tagDataUpdate", this.trackTagDataUpdated);
    this.player.playlist.on("nextTrackChange", this.nextTrackChanged);

    this.sourceNode = this.player.audioPlayer.createSourceNode();
    this.sourceNode.on("lastBufferQueued", this.lastBufferQueued);
    this.sourceNode.setVolume(1);
    this.sourceNode.pause();
    this.setupNodes();
}

AudioManager.prototype.setupNodes = function() {
    var audioCtx = this.player.getAudioContext();
    this.pauseResumeFadeGain = audioCtx.createGain();
    this.replayGain = audioCtx.createGain();
    this.seekGain = audioCtx.createGain();
    this.volumeGain = audioCtx.createGain();
    this.muteGain = audioCtx.createGain();
    this.fadeInGain = audioCtx.createGain();
    this.fadeOutGain = audioCtx.createGain();

    this.filterNodes = [];

    this.pauseResumeFadeGain.gain.value = 1;
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
    this.connectEqualizer(this.player.effectPreferences.getEqualizerSetup(this.track));
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
            this.tickCounter.reset();
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
        self.tickCounter.reset();
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
    var replayGain = this.player.effectPreferences.decibelChangeToAmplitudeRatio(
        track.getTrackGain() || track.getAlbumGain() || -6);

    if (track.getTrackPeak() > 1) {
        replayGain = (1 / track.getTrackPeak()) * replayGain;
    }

    this.replayGain.gain.value = replayGain;
    if (this.visualizer) {
        this.visualizer.setMultiplier(replayGain);
    }
};

AudioManager.prototype.getImage = function(pictureManager) {
    return this.track.getImage(pictureManager);
};

AudioManager.prototype.effectsChanged = function() {
    if (this.destroyed) return;
    this.connectEqualizer(this.player.effectPreferences.getEqualizerSetup(this.track));
};

AudioManager.prototype.crossfadingChanged = function() {
    if (this.destroyed) return;
    this.updateSchedules();
};

AudioManager.prototype.connectEqualizer = function(setup) {
    if (this.destroyed) return;
    var audioCtx = this.player.getAudioContext();
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
    var currentTime = this.getCurrentTime();
    var duration = this.getDuration();
    if (currentTime >= duration) {
        this.player.playlist.removeListener("nextTrackChange", this.nextTrackChangedWhilePreloading);
    }
    if (!this.tickCounter.hasTriggered() &&
        this.track &&
        currentTime >= 5 &&
        duration >= 10) {

        if (this.tickCounter.tick()) {
            this.track.triggerPlaythrough();
        }
    }
    this.player.audioManagerProgressed(this);
};

AudioManager.prototype.pause = function() {
    if (this.destroyed || !this.started) return;
    var now = this.player.getAudioContext().currentTime;
    this.tickCounter.pause();
    this.cancelPauseResumeFade();
    this.pauseResumeFadeGain.gain.cancelScheduledValues(0);
    this.pauseResumeFadeGain.gain.setValueCurveAtTime(
        PAUSE_FADE_CURVE, now, PAUSE_RESUME_FADE_TIME);
    var self = this;
    var id = ++this.pauseResumeFadeRequestId;
    Promise.delay(PAUSE_RESUME_FADE_TIME * 1000).then(function() {
        if (id !== self.pauseResumeFadeRequestId) {
            return;
        }
        if (self.destroyed) return;
        self.sourceNode.pause();
        if (self.visualizer) {
            self.visualizer.pause();
        }
    });
};

AudioManager.prototype.resume = function() {
    if (this.destroyed || !this.started) return;
    var now = this.player.getAudioContext().currentTime;
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
    if (this.destroyed || this.started) return;
    this.tickCounter.reset();
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
    var now = this.player.getAudioContext().currentTime;
    this.seekGain.gain.cancelScheduledValues(0);
    this.seekGain.gain.value = 1;
    this.seekGain.gain.setValueCurveAtTime(SEEK_START_CURVE, now, SEEK_START_FADE_TIME);
};

AudioManager.prototype.fadeInSeekGain = function() {
    var now = this.player.getAudioContext().currentTime;
    this.seekGain.gain.cancelScheduledValues(0);
    this.seekGain.gain.value = 0.001;
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
    var now = this.player.getAudioContext().currentTime;
    this.muteGain.gain.cancelScheduledValues(0);
    this.muteGain.gain.setValueCurveAtTime(PAUSE_FADE_CURVE, now, PAUSE_RESUME_FADE_TIME);
};

AudioManager.prototype.unmute = function() {
    if (this.destroyed) return;
    var now = this.player.getAudioContext().currentTime;
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

AudioManager.prototype.getFadeInTime = function() {
    var preferences = this.player.crossfadingPreferences.preferences();
    var fadeInEnabled = preferences.getInEnabled();

    if (!fadeInEnabled) return 0;

    if (!preferences.getShouldAlbumCrossFade()) {
        if (this.player.playlist.getPreviousTrack() &&
            this.track.comesAfterInSameAlbum(this.player.playlist.getPreviousTrack())) {
            return 0;
        }
    }

    var duration = this.getDuration();
    return Math.max(0, Math.min(preferences.getInTime(),
            duration - this.player.MINIMUM_DURATION - preferences.getOutTime()));
};

AudioManager.prototype.getFadeOutTime = function() {
    var preferences = this.player.crossfadingPreferences.preferences();
    var fadeOutEnabled = preferences.getOutEnabled();

    if (!fadeOutEnabled) return 0;

    if (!preferences.getShouldAlbumCrossFade()) {
        if (this.player.playlist.getNextTrack() &&
            this.track.comesBeforeInSameAlbum(this.player.playlist.getNextTrack())) {
            return 0;
        }
    }

    var duration = this.getDuration();
    return Math.max(0, Math.min(preferences.getOutTime(),
            duration - this.player.MINIMUM_DURATION - preferences.getInTime()));
};

AudioManager.prototype.updateSchedules = function(forceReset) {
    if (this.destroyed) return;
    var now = this.player.getAudioContext().currentTime;
    var trackCurrentTime = this.getCurrentTime();
    var trackDuration = this.getDuration();
    this.fadeInGain.gain.cancelScheduledValues(0);
    this.fadeOutGain.gain.cancelScheduledValues(0);
    this.fadeInGain.gain.value = 1;
    this.fadeOutGain.gain.value = 1;

    var preferences = this.player.crossfadingPreferences.preferences();
    var fadeInTime = this.getFadeInTime();
    var fadeOutTime = this.getFadeOutTime();
    var fadeInSamples = preferences.getInCurveSamples();
    var fadeOutSamples = preferences.getOutCurveSamples();


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
    this.pauseResumeFadeRequestId++;
};

AudioManager.prototype.getVisualizer = function() {
    if (this.destroyed || !this.started) return null;
    return this.visualizer;
};

AudioManager.prototype.destroy = function() {
    if (this.destroyed) return;
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
    this.player.audioManagerDestroyed(this);
    this.player = null;
};
