import {NEXT_TRACK_CHANGE_EVENT} from "player/PlaylistController";
import AudioVisualizer from "visualization/AudioVisualizer";
import PlaythroughTickCounter from "player/PlaythroughTickCounter";
import {cancelAndHold} from "audio/frontend/AudioPlayer";
import {MINIMUM_DURATION} from "audio/backend/demuxer";

const VOLUME_RATIO = 2;
const PLAYTHROUGH_COUNTER_THRESHOLD = 30;

export default class AudioManager {
    constructor(player, track, implicitlyLoaded) {
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
        this.volumeGain = null;
        this.muteGain = null;
        this.fadeInGain = null;
        this.fadeOutGain = null;
        this.filterNodes = [];
        this.visualizer = null;

        this.timeUpdated = this.timeUpdated.bind(this);
        this.ended = this.ended.bind(this);
        this.errored = this.errored.bind(this);
        this.nextTrackChanged = this.nextTrackChanged.bind(this);
        this.willSeek = this.willSeek.bind(this);
        this.didSeek = this.didSeek.bind(this);
        this.initialPlaythrough = this.initialPlaythrough.bind(this);
        this.lastBufferQueued = this.lastBufferQueued.bind(this);
        this.nextTrackChangedWhilePreloading = this.nextTrackChangedWhilePreloading.bind(this);

        this.player.playlist.on(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChanged);

        this.onDecodingLatency = this.onDecodingLatency.bind(this);
        this.sourceNode = this.player.audioPlayer.createSourceNode();
        this.sourceNode.on(`lastBufferQueued`, this.lastBufferQueued);
        this.sourceNode.on(`decodingLatency`, this.onDecodingLatency);
        this.sourceNode.pause();
        this.setupNodes();
    }

    setupNodes() {
        const audioCtx = this.player.getAudioContext();
        this.volumeGain = audioCtx.createGain();
        this.muteGain = audioCtx.createGain();
        this.fadeInGain = audioCtx.createGain();
        this.fadeOutGain = audioCtx.createGain();

        this.filterNodes = [];

        this.muteGain.gain.value = this.player.isMuted() ? 0 : 1;
        this.volumeGain.gain.value = this.player.getVolume() * VOLUME_RATIO;

        this.visualizer = new AudioVisualizer(audioCtx, this.sourceNode, this.player.visualizerCanvas, {
            baseSmoothingConstant: 0.00042,
            maxFrequency: 12500,
            minFrequency: 20
        });

        this.connectEqualizer(this.player.effectPreferencesBindingContext.getEqualizerSetup(this.track));
        this.volumeGain.connect(this.muteGain);
        this.muteGain.connect(this.fadeInGain);
        this.fadeInGain.connect(this.fadeOutGain);
        this.fadeOutGain.connect(audioCtx.destination);
        this.intendingToSeek = -1;
    }

    onDecodingLatency(decodingLatency) {
        if (this.player) {
            this.player.decodingLatencyValue(decodingLatency);
        }
    }

    destroyVisualizer() {
        if (this.visualizer) {
            this.visualizer.destroy();
            this.visualizer = null;
        }
    }

    // The track is only used for fade out and this audiomanager is otherwise
    // Obsolete.
    background() {
        this.destroyVisualizer();
    }

    audioContextReset() {
        if (this.destroyed) return;
        this.destroyVisualizer();
        this.setupNodes();
    }

    hasGaplessPreload() {
        return this.sourceNode.hasGaplessPreload();
    }

    _updateNextGaplessTrack() {
        this.gaplessPreloadTrack = this.player.playlist.getNextTrack();
        if (this.gaplessPreloadTrack) {
            const fileReference = this.gaplessPreloadTrack.getFileReference();
            this.sourceNode.replace(fileReference, 0, true);
        }
    }

    nextTrackChangedWhilePreloading() {
        this._updateNextGaplessTrack();
    }

    isSeekable() {
        return !this.destroyed && this.sourceNode.isSeekable();
    }

    lastBufferQueued() {
        const shouldPreload = this.player.currentAudioManager === this &&
                            this.player.playlist.getNextTrack() &&
                            this.player.getFadeInTimeForNextTrack() === 0 &&
                            !this.gaplessPreloadTrack;


        if (shouldPreload) {
            this.player.playlist.on(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChangedWhilePreloading);
            this._updateNextGaplessTrack();
        }
    }

    replaceTrack(track, explicitlyLoaded) {
        if (this.destroyed || this.player.currentAudioManager !== this) return;
        this.player.playlist.removeListener(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChangedWhilePreloading);
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
        const fileReference = track.getFileReference();
        this.sourceNode.replace(fileReference, this.currentTime, false);
    }

    nextTrackChanged() {
        if (this.destroyed) return;
        this.updateSchedules();
    }

    effectsChanged() {
        if (this.destroyed) return;
        this.connectEqualizer(this.player.effectPreferencesBindingContext.getEqualizerSetup(this.track));
    }

    crossfadingChanged() {
        if (this.destroyed) return;
        this.updateSchedules();
    }

    connectEqualizer(setup) {
        if (this.destroyed) return;
        const audioCtx = this.player.getAudioContext();
        try {
            this.sourceNode.node().disconnect();
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
            this.sourceNode.node().connect(this.volumeGain);
        } else {
            const lastFilter = nodes.reduce((prev, curr) => {
                prev.connect(curr);
                return curr;
            }, this.sourceNode.node());

            lastFilter.connect(this.volumeGain);
        }
    }

    setCurrentTime(currentTime) {
        if (this.destroyed) return;
        this.currentTime = currentTime;
        this.sourceNode.setCurrentTime(currentTime);
    }

    getCurrentTime() {
        if (this.destroyed) return 0;
        this.currentTime = this.sourceNode.getCurrentTime();
        return this.currentTime;
    }

    getDuration() {
        if (this.destroyed) return 0;
        return this.sourceNode.getDuration();
    }

    errored(e) {
        if (this.destroyed) return;
        this.player.audioManagerErrored(this, e);
    }

    ended(haveGaplessPreloadPending) {
        if (this.destroyed) return;
        this.player.playlist.removeListener(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChangedWhilePreloading);
        this.player.audioManagerEnded(this, haveGaplessPreloadPending);
    }

    seekIntent(value) {
        if (this.destroyed) return;
        this.intendingToSeek = value;
        this.player.audioManagerSeekIntent(this, this.intendingToSeek);
    }

    hasPlaythroughBeenTriggered() {
        return this.tickCounter.hasTriggered();
    }

    timeUpdated(currentTime, duration, willEmitEnded, endedHasBeenEmitted) {
        if (this.destroyed || this.intendingToSeek !== -1) return;
        const shouldHandleEnding = !willEmitEnded && !endedHasBeenEmitted;

        if (currentTime >= duration && shouldHandleEnding) {
            this.player.playlist.removeListener(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChangedWhilePreloading);
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
    }

    now() {
        return this.player.getAudioContext().currentTime;
    }

    pause() {
        if (this.destroyed || !this.started || this.paused) return;
        this.paused = true;
        this.tickCounter.pause();
        this.sourceNode.pause();
        if (this.visualizer) {
            this.visualizer.pause();
        }
    }

    resume() {
        if (this.destroyed || !this.started || !this.paused) return;
        this.paused = false;
        this.sourceNode.play();
        if (this.visualizer) {
            this.visualizer.resume();
        }
    }

    start() {
        if (this.destroyed || this.started) return;
        this.tickCounter.reset();
        this.intendingToSeek = -1;
        this.started = true;
        this.sourceNode.on(`timeUpdate`, this.timeUpdated);
        this.sourceNode.on(`ended`, this.ended);
        this.sourceNode.on(`error`, this.errored);
        this.sourceNode.on(`initialPlaythrough`, this.initialPlaythrough);
        const fileReference = this.track.getFileReference();
        this.sourceNode.load(fileReference, 0);
        this.sourceNode.play();
    }

    initialPlaythrough() {
        this.updateSchedules(!this.implicitlyLoaded);
        this.sourceNode.on(`seeking`, this.willSeek);
        this.sourceNode.on(`seekComplete`, this.didSeek);
    }

    willSeek() {
        this.intendingToSeek = -1;
    }

    didSeek() {
        if (this.destroyed) return;
        this.intendingToSeek = -1;
        this.updateSchedules(true);
    }

    mute() {
        if (this.destroyed) return;
        const scheduledTime = this.sourceNode.muteRequested();
        this.muteGain.gain.setValueAtTime(0, scheduledTime);
    }

    unmute() {
        if (this.destroyed) return;
        const scheduledTime = this.sourceNode.unmuteRequested();
        this.muteGain.gain.setValueAtTime(1, scheduledTime);
    }

    seek(time) {
        if (this.destroyed || !this.started) return;
        this.intendingToSeek = -1;
        this.setCurrentTime(time);
    }

    updateVolume(volume) {
        if (this.destroyed) return;
        this.volumeGain.gain.value = volume * VOLUME_RATIO;
    }

    getFadeInTime() {
        const preferences = this.player.crossfadePreferencesBindingContext.preferences();
        const fadeInEnabled = preferences.getInEnabled();

        if (!fadeInEnabled) return 0;

        if (preferences.getShouldAlbumNotCrossFade()) {
            if (this.player.playlist.getPreviousTrack() &&
                this.track.comesAfterInSameAlbum(this.player.playlist.getPreviousTrack())) {
                return 0;
            }
        }

        const duration = this.getDuration();
        return Math.max(0, Math.min(preferences.getInTime(),
                duration - MINIMUM_DURATION - preferences.getOutTime()));
    }

    getFadeOutTime() {
        const preferences = this.player.crossfadePreferencesBindingContext.preferences();
        const fadeOutEnabled = preferences.getOutEnabled();

        if (!fadeOutEnabled) return 0;

        if (preferences.getShouldAlbumNotCrossFade()) {
            if (this.player.playlist.getNextTrack() &&
                this.track.comesBeforeInSameAlbum(this.player.playlist.getNextTrack())) {
                return 0;
            }
        }

        const duration = this.getDuration();
        return Math.max(0, Math.min(preferences.getOutTime(),
                duration - MINIMUM_DURATION - preferences.getInTime()));
    }

    updateSchedules(forceReset) {
        if (this.destroyed) return;
        const trackCurrentTime = this.getCurrentTime();
        const trackDuration = this.getDuration();
        cancelAndHold(this.fadeInGain.gain, 0);
        cancelAndHold(this.fadeOutGain.gain, 0);

        const preferences = this.player.crossfadePreferencesBindingContext.preferences();
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

    }

    getVisualizer() {
        if (this.destroyed || !this.started) return null;
        return this.visualizer;
    }

    destroy() {
        if (this.destroyed) return;
        this.player.playlist.removeListener(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChanged);
        this.player.playlist.removeListener(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChangedWhilePreloading);
        this.sourceNode.removeListener(`lastBufferQueued`, this.lastBufferQueued);
        this.sourceNode.removeListener(`decodingLatency`, this.onDecodingLatency);
        this.filterNodes.forEach((node) => {
            node.disconnect();
        });
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
        this.filterNodes = [];
        this.track = null;
        this.destroyed = true;
        this.gaplessPreloadTrack = null;
        this.player.audioManagerDestroyed(this);
        this.player = null;
    }
}
