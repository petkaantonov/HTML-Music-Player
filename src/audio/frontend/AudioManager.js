import {NEXT_TRACK_CHANGE_EVENT} from "player/PlaylistController";
import PlaythroughTickCounter from "player/PlaythroughTickCounter";

const VOLUME_RATIO = 2;
const PLAYTHROUGH_COUNTER_THRESHOLD = 30;

export default class AudioManager {
    constructor(player, visualizer) {
        this.visualizer = visualizer;
        this.player = player;

        this.nextTrack = null;
        this.tickCounter = new PlaythroughTickCounter(PLAYTHROUGH_COUNTER_THRESHOLD);
        this.intendingToSeek = -1;
        this.track = null;
        this.sourceNode = null;
        this.paused = false;
        this.volumeGain = null;
        this.muteGain = null;
        this.filterNodes = [];

        this.timeUpdated = this.timeUpdated.bind(this);
        this.ended = this.ended.bind(this);
        this.errored = this.errored.bind(this);
        this.willSeek = this.willSeek.bind(this);
        this.didSeek = this.didSeek.bind(this);
        this.initialPlaythrough = this.initialPlaythrough.bind(this);
        this.lastBufferQueued = this.lastBufferQueued.bind(this);
        this.nextTrackChangedWhilePreloading = this.nextTrackChangedWhilePreloading.bind(this);

        this.onDecodingLatency = this.onDecodingLatency.bind(this);
        this.sourceNode = this.player.audioPlayer.createSourceNode();
        this.sourceNode.on(`lastBufferQueued`, this.lastBufferQueued);
        this.sourceNode.on(`decodingLatency`, this.onDecodingLatency);
        this.sourceNode.pause();
        this.visualizer.connectSourceNode(this.sourceNode);
        this.setupNodes();
    }

    setupNodes() {
        const audioCtx = this.player.getAudioContext();
        this.volumeGain = audioCtx.createGain();
        this.muteGain = audioCtx.createGain();

        this.filterNodes = [];

        this.muteGain.gain.value = this.player.isMuted() ? 0 : 1;
        this.volumeGain.gain.value = this.player.getVolume() * VOLUME_RATIO;
        this.connectEqualizer(this.player.effectPreferencesBindingContext.getEqualizerSetup(this.track));
        this.volumeGain.connect(this.muteGain);
        this.muteGain.connect(audioCtx.destination);
        this.intendingToSeek = -1;
    }

    onDecodingLatency(decodingLatency) {
        this.player.decodingLatencyValue(decodingLatency);
    }

    detachVisualizer() {
        this.visualizer.disconnectSourceNode(this.sourceNode);
    }

    audioContextReset() {
        this.setupNodes();
    }

    hasPreloadedNextTrack() {
        return this.sourceNode.hasPreloadedNextTrack();
    }

    _updateNextTrack() {
        this.nextTrack = this.player.playlist.getNextTrack();
        if (this.nextTrack) {
            const fileReference = this.nextTrack.getFileReference();
            this.sourceNode.replace(fileReference, 0, true);
        }
    }

    nextTrackChangedWhilePreloading() {
        this._updateNextTrack();
    }

    isSeekable() {
        return this.sourceNode.isSeekable();
    }

    lastBufferQueued() {
        if (this.player.playlist.getNextTrack() && !this.nextTrack) {
            this.player.playlist.on(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChangedWhilePreloading);
            this._updateNextTrack();
        }
    }

    replaceTrack(track) {
        this.player.playlist.removeListener(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChangedWhilePreloading);
        const {nextTrack} = this;
        this.nextTrack = null;
        this.tickCounter.reset();
        this.track = track;

        if (this.sourceNode.hasPreloadedNextTrack() && track === nextTrack) {
            this.intendingToSeek = -1;
            this.sourceNode.replaceWithPreloadedTrack();
            this.resume();
            return;
        }

        this.intendingToSeek = 0;
        this.player.audioManagerSeekIntent(0);
        this.sourceNode.removeAllListeners(`replacementLoaded`);
        this.sourceNode.once(`replacementLoaded`, () => {
            this.intendingToSeek = -1;
            this.resume();
        });
        const fileReference = track.getFileReference();
        this.sourceNode.replace(fileReference, 0, false);
    }

    effectsChanged() {
        this.connectEqualizer(this.player.effectPreferencesBindingContext.getEqualizerSetup(this.track));
    }

    connectEqualizer(setup) {
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
        this.sourceNode.setCurrentTime(currentTime);
    }

    getCurrentTime() {
        return this.sourceNode.getCurrentTime();
    }

    getDuration() {
        return this.sourceNode.getDuration();
    }

    errored(e) {
        if (this.track) {
            this.track.setError(e.message);
        }
        this.player.audioManagerErrored();
    }

    ended(nextTrackIsPreloading) {
        this.player.playlist.removeListener(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChangedWhilePreloading);
        const alreadyFinished = nextTrackIsPreloading && !this.hasPreloadedNextTrack();
        if (!alreadyFinished) {
            this.player.trackFinished();
        }
    }

    seekIntent(value) {
        this.intendingToSeek = value;
        this.player.audioManagerSeekIntent(this.intendingToSeek);
    }

    hasPlaythroughBeenTriggered() {
        return this.tickCounter.hasTriggered();
    }

    timeUpdated(currentTime, duration) {
        if (this.intendingToSeek !== -1) return;

        if (!this.tickCounter.hasTriggered() && this.track && currentTime >= 5 && duration >= 10) {
            if (this.tickCounter.tick()) {
                this.track.triggerPlaythrough();
            }
        }
        this.player.audioManagerProgressed(currentTime, duration);
    }

    pause() {
        if (!this.started || this.paused) return;
        this.paused = true;
        this.tickCounter.pause();
        this.sourceNode.pause();
    }

    resume() {
        if (!this.started || !this.paused) return;
        this.paused = false;
        this.sourceNode.play();
    }

    start(track) {
        if (this.started) return false;
        this.track = track;
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
        return true;
    }

    initialPlaythrough() {
        this.sourceNode.on(`seeking`, this.willSeek);
        this.sourceNode.on(`seekComplete`, this.didSeek);
    }

    willSeek() {
        this.intendingToSeek = -1;
    }

    didSeek() {
        this.intendingToSeek = -1;
    }

    durationKnown() {
        return new Promise((resolve) => {
            this.sourceNode.once(`timeUpdate`, resolve);
        });
    }

    mute() {
        const scheduledTime = this.sourceNode.muteRequested();
        this.muteGain.gain.setValueAtTime(0, scheduledTime);
    }

    unmute() {
        const scheduledTime = this.sourceNode.unmuteRequested();
        this.muteGain.gain.setValueAtTime(1, scheduledTime);
    }

    seek(time) {
        if (!this.started) return;
        this.intendingToSeek = -1;
        this.setCurrentTime(time);
    }

    updateVolume(volume) {
        this.volumeGain.gain.value = volume * VOLUME_RATIO;
    }
}
