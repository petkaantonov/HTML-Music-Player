import {NEXT_TRACK_CHANGE_EVENT} from "player/PlaylistController";
import PlaythroughTickCounter from "player/PlaythroughTickCounter";
import {LAST_BUFFER_LOADED_EVENT,
       TIME_UPDATE_EVENT,
       DECODING_LATENCY_EVENT,
       ENDED_EVENT,
       ERROR_EVENT} from "audio/frontend/AudioPlayerSourceNode";

const VOLUME_RATIO = 2;
const PLAYTHROUGH_COUNTER_THRESHOLD = 30;

export default class AudioManager {
    constructor(player, visualizer) {
        this.visualizer = visualizer;
        this.player = player;

        this.nextTrack = null;
        this.tickCounter = new PlaythroughTickCounter(PLAYTHROUGH_COUNTER_THRESHOLD);
        this.track = null;
        this.sourceNode = null;
        this.paused = false;
        this.volumeGain = null;
        this.muteGain = null;
        this.filterNodes = [];

        this.nextTrackChangedWhilePreloading = this.nextTrackChangedWhilePreloading.bind(this);

        this.sourceNode = this.player.audioPlayer.createSourceNode();
        this.sourceNode.on(LAST_BUFFER_LOADED_EVENT, this.lastBufferLoaded.bind(this));
        this.sourceNode.on(DECODING_LATENCY_EVENT, this.onDecodingLatency.bind(this));
        this.sourceNode.on(TIME_UPDATE_EVENT, this.timeUpdated.bind(this));
        this.sourceNode.on(ENDED_EVENT, this.ended.bind(this));
        this.sourceNode.on(ERROR_EVENT, this.errored.bind(this));
        this.visualizer.connectSourceNode(this.sourceNode);
        const audioCtx = this.player.getAudioContext();
        this.volumeGain = audioCtx.createGain();
        this.muteGain = audioCtx.createGain();

        this.filterNodes = [];

        this.muteGain.gain.value = this.player.isMuted() ? 0 : 1;
        this.volumeGain.gain.value = this.player.getVolume() * VOLUME_RATIO;
        this.connectEqualizer(this.player.effectPreferencesBindingContext.getEqualizerSetup(this.track));
        this.volumeGain.connect(this.muteGain);
        this.muteGain.connect(audioCtx.destination);
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
            this.sourceNode.preload(fileReference);
        }
    }

    nextTrackChangedWhilePreloading() {
        this._updateNextTrack();
    }

    isSeekable() {
        return this.sourceNode.isSeekable();
    }

    lastBufferLoaded() {
        if (this.player.playlist.getNextTrack() && !this.nextTrack) {
            this.player.playlist.on(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChangedWhilePreloading);
            this._updateNextTrack();
        }
    }

    loadTrack(track, isUserInitiatedSkip, initialProgress = 0) {
        if (isUserInitiatedSkip && !this.hasPlaythroughBeenTriggered() && this.track) {
            this.track.recordSkip();
        }

        this.player.playlist.removeListener(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChangedWhilePreloading);
        const {nextTrack} = this;
        this.nextTrack = null;
        this.tickCounter.reset();
        this.track = track;

        if (this.sourceNode.hasPreloadedNextTrack() && track === nextTrack) {
            this.sourceNode.replaceWithPreloadedTrack();
        } else {
            this.sourceNode.load(track.getFileReference(), initialProgress);
        }
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

    hasPlaythroughBeenTriggered() {
        return this.tickCounter.hasTriggered();
    }

    timeUpdated(currentTime, duration) {
        if (!this.tickCounter.hasTriggered() && this.track && currentTime >= 5 && duration >= 10) {
            if (this.tickCounter.tick()) {
                this.track.triggerPlaythrough();
            }
        }
        this.player.audioManagerProgressed(currentTime, duration);
    }

    pause() {
        if (this.paused) return;
        this.paused = true;
        this.tickCounter.pause();
        this.sourceNode.pause();
    }

    resume() {
        if (!this.paused) return;
        this.paused = false;
        this.sourceNode.play();
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
        this.setCurrentTime(time);
    }

    updateVolume(volume) {
        this.volumeGain.gain.value = volume * VOLUME_RATIO;
    }
}
