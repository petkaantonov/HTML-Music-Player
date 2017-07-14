import {Float32Array} from "platform/platform";
import {delay} from "util";
import AudioVisualizer from "visualization/AudioVisualizer";
import PlaythroughTickCounter from "player/PlaythroughTickCounter";
import {cancelAndHold} from "audio/AudioPlayerAudioBufferImpl";

const PAUSE_RESUME_FADE_TIME = 0.37;
const RESUME_FADE_CURVE = new Float32Array([0, 1]);
const PAUSE_FADE_CURVE = new Float32Array([1, 0]);
const VOLUME_RATIO = 2;
const PLAYTHROUGH_COUNTER_THRESHOLD = 30;

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
    this.paused = false;
    this.pauseResumeFadeGain = null;
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
    this.willSeek = this.willSeek.bind(this);
    this.didSeek = this.didSeek.bind(this);
    this.initialPlaythrough = this.initialPlaythrough.bind(this);
    this.lastBufferQueued = this.lastBufferQueued.bind(this);
    this.nextTrackChangedWhilePreloading = this.nextTrackChangedWhilePreloading.bind(this);

    this.player.playlist.on(`nextTrackChange`, this.nextTrackChanged);

    this.sourceNode = this.player.audioPlayer.createSourceNode();
    this.sourceNode.on(`lastBufferQueued`, this.lastBufferQueued);
    this.sourceNode.pause();
    this.setupNodes();
}

AudioManager.prototype.setupNodes = function() {
    const audioCtx = this.player.getAudioContext();
    this.pauseResumeFadeGain = audioCtx.createGain();
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
        minFrequency: 20
    });

    this.sourceNode.node().connect(this.pauseResumeFadeGain);
    this.connectEqualizer(this.player.effectPreferences.getEqualizerSetup(this.track));
    this.volumeGain.connect(this.muteGain);
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
// Obsolete.
AudioManager.prototype.background = function() {
    this.destroyVisualizer();
};

AudioManager.prototype.audioContextReset = function() {
    if (this.destroyed) return;
    this.destroyVisualizer();
    this.setupNodes();
};

AudioManager.prototype.hasGaplessPreload = function() {
    return this.sourceNode.hasGaplessPreload();
};

AudioManager.prototype._updateNextGaplessTrack = function() {
    this.gaplessPreloadTrack = this.player.playlist.getNextTrack();
    if (this.gaplessPreloadTrack) {
        this.sourceNode.replace(this.gaplessPreloadTrack.getFile(),
                                0,
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
    const shouldPreload = this.player.currentAudioManager === this &&
                        this.player.playlist.getNextTrack() &&
                        this.player.getFadeInTimeForNextTrack() === 0 &&
                        !this.gaplessPreloadTrack;


    if (shouldPreload) {
        this.player.playlist.on(`nextTrackChange`, this.nextTrackChangedWhilePreloading);
        this._updateNextGaplessTrack();
    }
};

AudioManager.prototype.replaceTrack = function(track, explicitlyLoaded) {
    if (this.destroyed || this.player.currentAudioManager !== this) return;
    this.player.playlist.removeListener(`nextTrackChange`, this.nextTrackChangedWhilePreloading);
    const {gaplessPreloadTrack} = this;
    this.gaplessPreloadTrack = null;

    if (this.sourceNode.hasGaplessPreload() &&
        !explicitlyLoaded &&
        track === gaplessPreloadTrack) {
        this.tickCounter.reset();
        this.intendingToSeek = -1;
        this.track = track;
        this.updateSchedules();
        this.sourceNode.replaceUsingGaplessPreload();
        this.resume();
        return;
    }

    this.intendingToSeek = 0;
    this.player.audioManagerSeekIntent(this, 0);
    this.track = track;
    this.implicitlyLoaded = false;
    this.sourceNode.removeAllListeners(`replacementLoaded`);
    this.sourceNode.once(`replacementLoaded`, () => {
        this.tickCounter.reset();
        this.intendingToSeek = -1;
        if (this.destroyed || this.player.currentAudioManager !== this) return;
        this.resume();
    });
    this.currentTime = 0;
    this.sourceNode.replace(track.getFile(), this.currentTime, false, track.playerMetadata());
};

AudioManager.prototype.nextTrackChanged = function() {
    if (this.destroyed) return;
    this.updateSchedules();
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
    const audioCtx = this.player.getAudioContext();
    try {
        this.pauseResumeFadeGain.disconnect();
    } catch (e) {
        // NOOP
    }

    this.filterNodes.forEach((node) => {
        try {
            node.disconnect();
        } catch (e) {
            // NOOP
        }
    });

    const nodes = [];
    const {specs, gains} = setup;

    for (let i = 0; i < gains.length; ++i) {
        const gain = gains[i];
        if (gain !== 0) {
            const spec = specs[i];
            const node = audioCtx.createBiquadFilter();
            node.type = spec[1];
            node.Q.value = 1;
            node.frequency.value = spec[0];
            node.gain.value = gain;
            nodes.push(node);
        }
    }
    this.filterNodes = nodes;

    if (!nodes.length) {
        this.pauseResumeFadeGain.connect(this.volumeGain);
    } else {
        const lastFilter = nodes.reduce((prev, curr) => {
            prev.connect(curr);
            return curr;
        }, this.pauseResumeFadeGain);

        lastFilter.connect(this.volumeGain);
    }
};

AudioManager.prototype.setCurrentTime = function(currentTime) {
    if (this.destroyed) return;
    this.currentTime = currentTime;
    this.sourceNode.setCurrentTime(currentTime);
};

AudioManager.prototype.getCurrentTime = function() {
    if (this.destroyed) return 0;
    this.currentTime = this.sourceNode.getCurrentTime();
    return this.currentTime;
};

AudioManager.prototype.getDuration = function() {
    if (this.destroyed) return 0;
    return this.sourceNode.getDuration();
};

AudioManager.prototype.errored = function(e) {
    if (this.destroyed) return;
    this.player.audioManagerErrored(this, e);
};

AudioManager.prototype.ended = function(haveGaplessPreloadPending) {
    if (this.destroyed) return;
    this.player.playlist.removeListener(`nextTrackChange`, this.nextTrackChangedWhilePreloading);
    this.player.audioManagerEnded(this, haveGaplessPreloadPending);
};

AudioManager.prototype.seekIntent = function(value) {
    if (this.destroyed) return;
    this.intendingToSeek = value;
    this.player.audioManagerSeekIntent(this, this.intendingToSeek);
};

AudioManager.prototype.hasPlaythroughBeenTriggered = function() {
    return this.tickCounter.hasTriggered();
};

AudioManager.prototype.timeUpdated = function(currentTime, duration, willEmitEnded, endedHasBeenEmitted) {
    if (this.destroyed || this.intendingToSeek !== -1) return;
    const shouldHandleEnding = !willEmitEnded && !endedHasBeenEmitted;

    if (currentTime >= duration && shouldHandleEnding) {
        this.player.playlist.removeListener(`nextTrackChange`, this.nextTrackChangedWhilePreloading);
    }
    if (!this.tickCounter.hasTriggered() &&
        this.track &&
        currentTime >= 5 &&
        duration >= 10) {

        if (this.tickCounter.tick()) {
            this.track.triggerPlaythrough();
        }
    }
    this.player.audioManagerProgressed(this, currentTime, duration, shouldHandleEnding);
};

AudioManager.prototype.now = function() {
    return this.player.getAudioContext().currentTime;
};

AudioManager.prototype.pause = async function() {
    if (this.destroyed || !this.started || this.paused) return;
    this.paused = true;
    this.tickCounter.pause();
    this.cancelPauseResumeFade();
    cancelAndHold(this.pauseResumeFadeGain.gain, 0);
    this.pauseResumeFadeGain.gain.setValueCurveAtTime(
        PAUSE_FADE_CURVE, this.now(), PAUSE_RESUME_FADE_TIME);
    const id = ++this.pauseResumeFadeRequestId;
    await delay(PAUSE_RESUME_FADE_TIME * 1000);
    if (id !== this.pauseResumeFadeRequestId) return;
    if (this.destroyed) return;
    this.sourceNode.pause();
    if (this.visualizer) {
        this.visualizer.pause();
    }
};

AudioManager.prototype.resume = function() {
    if (this.destroyed || !this.started || !this.paused) return;
    this.paused = false;
    this.cancelPauseResumeFade();
    this.sourceNode.play();
    if (this.visualizer) {
        this.visualizer.resume();
    }
    cancelAndHold(this.pauseResumeFadeGain.gain, 0);
    this.pauseResumeFadeGain.gain.setValueCurveAtTime(
        RESUME_FADE_CURVE, this.now(), PAUSE_RESUME_FADE_TIME);
};

AudioManager.prototype.start = function() {
    if (this.destroyed || this.started) return;
    this.tickCounter.reset();
    this.intendingToSeek = -1;
    this.started = true;
    this.sourceNode.on(`timeUpdate`, this.timeUpdated);
    this.sourceNode.on(`ended`, this.ended);
    this.sourceNode.on(`error`, this.errored);
    this.sourceNode.on(`initialPlaythrough`, this.initialPlaythrough);
    this.sourceNode.load(this.track.getFile(),
                         0,
                         this.track.playerMetadata());
    this.sourceNode.play();
};

AudioManager.prototype.initialPlaythrough = function() {
    this.updateSchedules(!this.implicitlyLoaded);
    this.sourceNode.on(`seeking`, this.willSeek);
    this.sourceNode.on(`seekComplete`, this.didSeek);
};

AudioManager.prototype.willSeek = function() {
    this.intendingToSeek = -1;
};

AudioManager.prototype.didSeek = function() {
    if (this.destroyed) return;
    this.intendingToSeek = -1;
    this.updateSchedules(true);
};

AudioManager.prototype.mute = function() {
    if (this.destroyed) return;
    cancelAndHold(this.muteGain.gain, 0);
    this.muteGain.gain.setValueCurveAtTime(PAUSE_FADE_CURVE, this.now(), PAUSE_RESUME_FADE_TIME);
};

AudioManager.prototype.unmute = function() {
    if (this.destroyed) return;
    cancelAndHold(this.muteGain.gain, 0);
    this.muteGain.gain.setValueCurveAtTime(RESUME_FADE_CURVE, this.now(), PAUSE_RESUME_FADE_TIME);
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
    const preferences = this.player.crossfadingPreferences.preferences();
    const fadeInEnabled = preferences.getInEnabled();

    if (!fadeInEnabled) return 0;

    if (!preferences.getShouldAlbumCrossFade()) {
        if (this.player.playlist.getPreviousTrack() &&
            this.track.comesAfterInSameAlbum(this.player.playlist.getPreviousTrack())) {
            return 0;
        }
    }

    const duration = this.getDuration();
    return Math.max(0, Math.min(preferences.getInTime(),
            duration - this.player.MINIMUM_DURATION - preferences.getOutTime()));
};

AudioManager.prototype.getFadeOutTime = function() {
    const preferences = this.player.crossfadingPreferences.preferences();
    const fadeOutEnabled = preferences.getOutEnabled();

    if (!fadeOutEnabled) return 0;

    if (!preferences.getShouldAlbumCrossFade()) {
        if (this.player.playlist.getNextTrack() &&
            this.track.comesBeforeInSameAlbum(this.player.playlist.getNextTrack())) {
            return 0;
        }
    }

    const duration = this.getDuration();
    return Math.max(0, Math.min(preferences.getOutTime(),
            duration - this.player.MINIMUM_DURATION - preferences.getInTime()));
};

AudioManager.prototype.updateSchedules = function(forceReset) {
    if (this.destroyed) return;
    const trackCurrentTime = this.getCurrentTime();
    const trackDuration = this.getDuration();
    cancelAndHold(this.fadeInGain.gain, 0);
    cancelAndHold(this.fadeOutGain.gain, 0);

    const preferences = this.player.crossfadingPreferences.preferences();
    const fadeInTime = this.getFadeInTime();
    const fadeOutTime = this.getFadeOutTime();
    const fadeInSamples = preferences.getInCurveSamples();
    const fadeOutSamples = preferences.getOutCurveSamples();

    if (fadeInTime > 0 && this.implicitlyLoaded && !forceReset) {
        const audioCtxTime = this.now() - trackCurrentTime;
        if (audioCtxTime > 0) {
            this.fadeInGain.gain.setValueCurveAtTime(fadeInSamples, audioCtxTime, fadeInTime);
        }
    }

    if (fadeOutTime > 0) {
        const trackCurrentTimeForFadeOut = trackDuration - fadeOutTime;
        const secondsUntilFadeOut = trackCurrentTimeForFadeOut - trackCurrentTime;
        const audioCtxTime = Math.max(0, this.now() + secondsUntilFadeOut);
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
    this.player.playlist.removeListener(`nextTrackChange`, this.nextTrackChanged);
    this.player.playlist.removeListener(`nextTrackChange`, this.nextTrackChangedWhilePreloading);
    this.sourceNode.removeListener(`lastBufferQueued`, this.lastBufferQueued);
    this.filterNodes.forEach((node) => {
        node.disconnect();
    });
    this.pauseResumeFadeGain.disconnect();
    this.muteGain.disconnect();
    this.volumeGain.disconnect();
    this.fadeInGain.disconnect();
    this.fadeOutGain.disconnect();
    this.sourceNode.destroy();
    this.destroyVisualizer();
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
