"use strict";
import $ from "lib/jquery";
import Promise from "lib/bluebird";
import AudioPlayer from "audio/AudioPlayerAudioBufferImpl";
import AudioManager from "audio/AudioManager";
import AudioVisualizer from "audio/AudioVisualizer";
import EventEmitter from "lib/events";
import { documentHidden, inherits } from "lib/util";
import { makeTooltip } from "ui/GlobalUi";
import Track from "Track";
import { TOUCH_EVENTS, isTouchEvent, tapHandler } from "lib/DomUtil";

const MINIMUM_DURATION = 3;
const VOLUME_RATIO = 2;
var audioCtx;
const audioPlayer = new AudioPlayer(null, 20);
audioCtx = audioPlayer.getAudioContext();
const SILENT_BUFFER = audioCtx.createBuffer(audioCtx.destination.channelCount, 8192, audioCtx.sampleRate);

const VOLUME_KEY = "volume";
const MUTED_KEY = "muted";
const LATENCY_KEY = "audio-hardware-latency";




effects.on("effectsChange", function() {
    Promise.resolve(audioPlayer.ready).then(function() {
        audioPlayer.setEffects(effects.getAudioPlayerEffects());
    });
});

export default function Player(dom, playlist, opts) {
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

// Supports deletion mid-iteration.
Player.prototype.forEachAudioManager = function(fn) {
    var currentLength = this.audioManagers.length;
    for (var i = 0; i < this.audioManagers.length; ++i) {
        fn(this.audioManagers[i], i, this.audioManagers);
        // Deleted from the array.
        if (currentLength > this.audioManagers.length) {
            i -= (currentLength - this.audioManagers.length);
            currentLength = this.audioManagers.length;
        }
    }
};

Player.prototype.destroyAudioManagers = function(exceptThisOne) {
    this.forEachAudioManager(function(am) {
        if (am !== exceptThisOne) {
            am.destroy();
        }
    });
};
