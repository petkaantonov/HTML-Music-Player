const Player = (function () {"use strict";

const audioCtx = (function() {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    return new AudioContext();
})();

const mediaElementPool = (function() {
    $(document).one("click.poolpriming touchstart.poolpriming", function() {
        $(document).off(".poolpriming");
        pool.forEach(function(element) {
            element.volume = 0;
            element.play();
        });
    });

    const pool = [
        document.createElement("audio"),
        document.createElement("audio"),
        document.createElement("audio"),
        document.createElement("audio"),
        document.createElement("audio"),
        document.createElement("audio")
    ];

    var id = 1;

    return {
        alloc: function() {
            var element = pool.shift();
            element.currentTime = 0;
            element.volume = 0;
            element.src = "";
            element.pause();
            if (!element.id) element.id = id++;
            return element;
        },

        free: function(element) {
            element.currentTime = 0;
            element.volume = 0;
            element.muted = true;
            element.src = "";
            element.load();
            element.pause();
            pool.push(element);
        }
    };
})();

const getMediaElementSourceFor = function(mediaElement) {
    var src = $(mediaElement).data("media-element-source");

    if (!src) {
        src = audioCtx.createMediaElementSource(mediaElement);
        $(mediaElement).data("media-element-source", src);
    }
    return src;
};

const PAUSE_RESUME_FADE_TIME = 0.37;
const RESUME_FADE_CURVE = new Float32Array([0, 1]);
const PAUSE_FADE_CURVE = new Float32Array([1, 0]);

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

function destroyAudioManagers() {
    var ams = [];
    forEachAudioManager(function(am, index, audioManagers) {
        am.pause();
        ams.push(am)
        audioManagers.splice(index, 1);
    });
    Promise.map(ams, function(am) {
        if (!am.pauseResumeFadePromise) {
            if (am.destroyed) return;
            if (am.started) {
                am.pause();
            } else {
                am.destroy();
                return;
            }
        }
        return am.pauseResumeFadePromise.finally(function() {
            am.destroy();
        });
    });
}

const audioManagers = [];
function AudioManager(player, track, implicitlyLoaded) {
    audioManagers.push(this);
    var tagData = track.getTagData();
    var sampleRate = track.getBasicInfo().sampleRate;
    this.implicitlyLoaded = implicitlyLoaded;
    this.player = player;
    this.destroyed = false;
    this.started = false;
    this.track = track;

    var preloadedMediaElement = player.flushPreloadedMediaElementFor(track);
    if (preloadedMediaElement) {
        var mediaData = preloadedMediaElement.release();
        this.url = mediaData.url;
        this.mediaElement = mediaData.element;
        this.image = mediaData.image;
        this.mediaElementRequiresLoading = false;
    } else {
        this.url = URL.createObjectURL(track.getFile());
        this.mediaElement = mediaElementPool.alloc();
        this.mediaElementRequiresLoading = true;
        this.image = track.getImage();
    }

    this.mediaElement.autoplay = false;
    this.mediaElement.controls = false;
    this.mediaElement.loop = false;
    this.mediaElement.volume = 1;
    this.mediaElement.muted = false;
    this.mediaElement.preload = "none";
    this.setCurrentTime(0);
    this.mediaElement.pause();

    this.source = getMediaElementSourceFor(this.mediaElement);
    this.visualizer = new AudioVisualizer(audioCtx, {
        fps: 48,
        bins: Player.visualizerBins(),
        baseSmoothingConstant: 0.0007,
        maxFrequency: 12500,
        minFrequency: 20
    });
    this.pauseResumeFadeGain = audioCtx.createGain();
    this.replayGain = audioCtx.createGain();
    this.preampGain = audioCtx.createGain();
    this.volumeGain = audioCtx.createGain();
    this.muteGain = audioCtx.createGain();
    this.fadeInGain = audioCtx.createGain();
    this.fadeOutGain = audioCtx.createGain();
    this.filterNodes = [];

    this.pauseResumeFadeGain.gain.value = 1;
    this.pauseResumeFadePromise = null;
    this.muteGain.gain.value = player.isMuted() ? 0 : 1;
    this.preampGain.gain.value = 1;
    this.volumeGain.gain.value = player.getVolume();

    var replayGain = equalizer.decibelChangeToAmplitudeRatio(
        track.getTrackGain() || track.getAlbumGain() || -6);

    if (track.getTrackPeak() * replayGain > 1) {
        replayGain = (1 / track.getTrackPeak()) * replayGain;
    }

    this.replayGain.gain.value = replayGain;

    this.source.connect(this.pauseResumeFadeGain);
    this.pauseResumeFadeGain.connect(this.replayGain);
    this.replayGain.connect(this.preampGain);
    this.connectEqualizerFilters(equalizer.getBands(this.track));
    this.visualizer.connect(this.volumeGain);
    this.volumeGain.connect(this.muteGain);
    this.muteGain.connect(this.fadeInGain);
    this.fadeInGain.connect(this.fadeOutGain)
    this.fadeOutGain.connect(audioCtx.destination);
    this.timeUpdated = this.timeUpdated.bind(this);
    this.ended = this.ended.bind(this);
    this.errored = this.errored.bind(this);
    this.durationChanged = this.durationChanged.bind(this);
    this.equalizerChanged = this.equalizerChanged.bind(this);
    this.crossFadingChanged = this.crossFadingChanged.bind(this);
    this.nextTrackChanged = this.nextTrackChanged.bind(this);

    equalizer.on("equalizerChange", this.equalizerChanged);
    crossfading.on("crossFadingChange", this.crossFadingChanged);
    player.playlist.on("nextTrackChange", this.nextTrackChanged);
}

AudioManager.prototype.nextTrackChanged = function() {
    if (this.destroyed) return;
    this.updateSchedules();
};

AudioManager.prototype.getImage = function() {
    return this.image;
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
    var a = Date.now();
    var preampGain = 1;
    var bandsFrequencySorted = Object.keys(bands).map(function(key) {
        if (!isFinite(+key)) return null;
        return {
            frequency: +key,
            gain: bands[key]
        };
    }).filter(Boolean).sort(function(a, b) {
        return a.frequency - b.frequency;
    });

    if (typeof bands.preamp === "number") {
        preampGain = equalizer.decibelChangeToAmplitudeRatio(bands.preamp);
    } else {
        var maxIncrease = bandsFrequencySorted.reduce(function(max, current) {
            return Math.max(current.gain, max);
        }, -Infinity);

        if (maxIncrease > 0) {
            preampGain = equalizer.decibelChangeToAmplitudeRatio(-0.75 * maxIncrease);
        }
    }

    this.filterNodes.forEach(function(node) {
        node.disconnect();
    });

    var someBandHasGainOrAttenuation = bandsFrequencySorted.some(function(v) {
        return +v.gain !== 0;
    });

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

        this.preampGain.gain.value = preampGain;

        var lastFilter = this.filterNodes.reduce(function(prev, curr) {
            prev.connect(curr);
            return curr;
        }, this.preampGain);

        lastFilter.connect(this.visualizer.getAudioNode());
    } else {
        this.preampGain.gain.value = 1;
        this.preampGain.connect(this.visualizer.getAudioNode());
    }
};

AudioManager.prototype.setCurrentTime = function(currentTime) {
    if (this.destroyed) return;
    this.mediaElement.currentTime = this.track.convertFromSilenceAdjustedTime(currentTime);
};

AudioManager.prototype.getCurrentTime = function() {
    if (this.destroyed) return 0;
    return this.track.convertToSilenceAdjustedTime(this.mediaElement.currentTime);
};

AudioManager.prototype.getDuration = function() {
    if (this.destroyed) return 0;
    return this.track.getSilenceAdjustedDuration(this.mediaElement.duration);
};

AudioManager.prototype.durationChanged = function() {
    if (this.destroyed) return;
    this.updateSchedules(!this.implicitlyLoaded);
};

AudioManager.prototype.errored = function() {
    if (this.destroyed) return;
    this.player.audioManagerErrored(this);
};

AudioManager.prototype.ended = function() {
    if (this.destroyed) return;
    this.player.audioManagerEnded(this);
};

AudioManager.prototype.timeUpdated = function() {
    if (this.destroyed) return;
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
        self.mediaElement.pause();
        self.visualizer.pause();
    }).finally(function() {
        self.pauseResumeFadePromise  = null;
    });
};

AudioManager.prototype.resume = function() {
    if (this.destroyed || !this.started) return;
    var now = audioCtx.currentTime;
    this.cancelPauseResumeFade();
    this.mediaElement.play();
    this.visualizer.resume();
    this.pauseResumeFadeGain.gain.cancelScheduledValues(0);
    this.pauseResumeFadeGain.gain.setValueCurveAtTime(
        RESUME_FADE_CURVE, now, PAUSE_RESUME_FADE_TIME);
};

AudioManager.prototype.start = function() {
    if (this.destroyed || this.started) return;
    this.started = true;

    this.mediaElement.addEventListener("timeupdate", this.timeUpdated, false);
    this.mediaElement.addEventListener("ended", this.ended, false);
    this.mediaElement.addEventListener("error", this.errored, false);
    this.mediaElement.addEventListener("durationchange", this.durationChanged, false);

    if (this.mediaElementRequiresLoading) {
        this.mediaElement.src = this.url;
        this.mediaElement.load();
    }
    this.mediaElement.play();
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
    this.setCurrentTime(time);
};

AudioManager.prototype.updateVolume = function(volume) {
    if (this.destroyed) return;
    this.volumeGain.gain.value = volume;
};

AudioManager.prototype.updateSchedules = function(forceReset) {
    if (this.destroyed) return;
    var now = audioCtx.currentTime;
    var trackPosition = this.getCurrentTime();
    var trackLength = this.getDuration();
    this.fadeInGain.gain.cancelScheduledValues(0);
    this.fadeOutGain.gain.cancelScheduledValues(0);
    this.fadeInGain.gain.value = 1;
    this.fadeOutGain.gain.value = 1;

    var crossFadePreferences = crossfading.getPreferences();
    var fadeInTime = crossFadePreferences.getInTime();
    var fadeOutTime = crossFadePreferences.getOutTime();
    var fadeInEnabled = crossFadePreferences.getInEnabled();
    var fadeOutEnabled = crossFadePreferences.getOutEnabled();
    var fadeInSamples = crossFadePreferences.getInCurveSamples();
    var fadeOutSamples = crossFadePreferences.getOutCurveSamples();

    if (!crossFadePreferences.getShouldAlbumCrossFade()) {
        if (this.track.comesAfterInSameAlbum(this.player.playlist.getPreviousTrack())) {
            fadeInEnabled = false;
        }

        if (this.track.comesBeforeInSameAlbum(this.player.playlist.getNextTrack())) {
            fadeOutEnabled = false;
        }
    }

    if (fadeInEnabled && this.implicitlyLoaded && !forceReset) {
        var audioCtxTime = now - trackPosition;
        if (audioCtxTime > 0) {
            this.fadeInGain.gain.setValueCurveAtTime(
                fadeInSamples, audioCtxTime, fadeInTime);
        }
    }

    if (fadeOutEnabled) {
        var trackPositionForFadeOut = trackLength - fadeOutTime;
        var secondsUntilFadeOut = trackPositionForFadeOut - trackPosition;
        var audioCtxTime = Math.max(0, now + secondsUntilFadeOut);

        this.fadeOutGain.gain.setValueCurveAtTime(
            fadeOutSamples, audioCtxTime, fadeOutTime);
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
    this.image = null;
    equalizer.removeListener("equalizerChange", this.equalizerChanged);
    crossfading.removeListener("crossFadingChange", this.crossFadingChanged);
    this.player.playlist.removeListener("nextTrackChange", this.nextTrackChanged);
    URL.revokeObjectURL(this.url);
    this.url = null;
    this.filterNodes.forEach(function(node) {
        node.disconnect();
    });
    this.pauseResumeFadeGain.disconnect();
    this.muteGain.disconnect();
    this.preampGain.disconnect();
    this.volumeGain.disconnect();
    this.fadeInGain.disconnect();
    this.fadeOutGain.disconnect();
    this.source.disconnect();
    this.visualizer.destroy();
    this.mediaElement.removeEventListener("timeupdate", this.timeUpdated, false);
    this.mediaElement.removeEventListener("ended", this.ended, false);
    this.mediaElement.removeEventListener("error", this.errored, false);
    this.mediaElement.removeEventListener("durationchange", this.durationChanged, false);
    mediaElementPool.free(this.mediaElement);
    this.mediaElement = null;
    this.fadeInGain = null;
    this.fadeOutGain = null;
    this.source = null;
    this.visualizer = null;
    this.preampGain = null;
    this.volumeGain = null;
    this.muteGain = null;
    this.pauseResumeFadeGain = null;
    this.filterNodes = [];
    this.track = null;
    this.destroyed = true;
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

    this.currentAudioManager = null;
    this.volume = 0.15;
    this.isStopped = true;
    this.isPaused = false;
    this.isPlaying = false;
    this.isMutedValue = false;
    this.implicitLoading = false;
    this.playlist = playlist;
    this.queuedNextTrackImplicitly = false;
    this._preloadedTracks = [];

    this.visualizerData = this.visualizerData.bind(this);
    this.nextTrackChanged = this.nextTrackChanged.bind(this);


    this.$play().click(this.playButtonClicked.bind(this));
    this.$next().click(playlist.next.bind(playlist));
    this.$previous().click(playlist.prev.bind(playlist));

    this._playTooltip = PanelControls.makeTooltip(this.$play(), function() {
        return self.isPlaying ? "Pause playback"
                            : self.isPaused ? "Resume playback" : "Start playback";
    });

    this._nextTooltip = PanelControls.makeTooltip(this.$next(), "Next track");
    this._previousTooltip = PanelControls.makeTooltip(this.$previous(), "Previous track");

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

Player.prototype.visualizerData = function(data) {
    this.emit("visualizerData", data);
};

Player.prototype.historyChanged = function() {
    this.checkButtonState();
};

Player.prototype.nextTrackChanged = function() {
    this.checkButtonState();
    var track = this.playlist.getNextTrack();
    if (!track) return;

    for (var i = 0; i < this._preloadedTracks.length; ++i) {
        if (this._preloadedTracks[i].isForTrack(track)) return;
    }

    var preloadedTrack = new PreloadedMediaElement(track);
    preloadedTrack.startPreload();
    this._preloadedTracks.push(preloadedTrack);

    while (this._preloadedTracks.length > 2) {
        this._preloadedTracks.shift().destroy();
    }
};

Player.prototype.flushPreloadedMediaElementFor = function(track) {
    var ret = null;
    for (var i = 0; i < this._preloadedTracks.length; ++i) {
        if (this._preloadedTracks[i].isForTrack(track)) {
            ret = this._preloadedTracks[i];
            this._preloadedTracks.splice(i, 1);
            break;
        }
    }
    return ret;
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

Player.prototype.audioManagerErrored = function(audioManager) {
    if (audioManager === this.currentAudioManager) {
        this.emit("error", this.playlist.getCurrentTrack());
        this.playlist.removeTrack(this.playlist.getCurrentTrack());
        this.nextTrackImplicitly();
    }
    audioManager.destroy();
};

Player.prototype.audioManagerEnded = function(audioManager) {
    if (audioManager === this.currentAudioManager) {
        this.playlist.trackPlayedSuccessfully();
        this.nextTrackImplicitly();
    }
    audioManager.destroy();
};

Player.prototype.getProgress = function() {
    if (!this.currentAudioManager) return -1;
    var duration = this.currentAudioManager.getDuration();
    if (!duration) return -1;
    var currentTime = this.currentAudioManager.getCurrentTime();
    return Math.round((currentTime / duration) * 100) / 100;
};

Player.prototype.setProgress = function(p) {
    if (!this.currentAudioManager) return;
    p = Math.min(Math.max(p, 0), 1);
    var duration = this.currentAudioManager.getDuration();
    if (!duration) return;
    return this.seek(p * duration);
};

Player.prototype.getFadeInTimeForNextTrack = function() {
    var preferences = crossfading.getPreferences();
    var fadeInTime = preferences.getInTime();
    if (fadeInTime <= 0) return 0;

    var audioManager = this.currentAudioManager;

    if (!audioManager) return 0;

    if (!preferences.getShouldAlbumCrossFade() &&
        audioManager.track.comesBeforeInSameAlbum(this.playlist.getNextTrack())) {
        return 0;
    }

    return fadeInTime;
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
            this.playlist.trackPlayedSuccessfully();
            this.nextTrackImplicitly();
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

Player.prototype.getImage= function() {
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
    this.emit("progress", 0, 0);

    this.isStopped = false;
    this.isPlaying = true;
    this.isPaused = false;

    var implicit = this.implicitLoading;
    if (this.implicitLoading) {
        this.implicitLoading = false;
    } else {
        destroyAudioManagers();
    }

    if (this.currentAudioManager) {
        var visualizer = this.currentAudioManager.getVisualizer();
        if (visualizer) {
            visualizer.removeListener("data", this.visualizerData);
        }
    }
    this.currentAudioManager = new AudioManager(this, track, implicit);
    this.currentAudioManager.visualizer.on("data", this.visualizerData);
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
        this.$play().addClass("active");
        if (this.isPlaying) {
            this.$play()
                .find(".play-pause-morph-icon")
                .removeClass("pause")
                .addClass("play");
        } else {
            this.$play()
                .find(".play-pause-morph-icon")
                .removeClass("play")
                .addClass("pause");
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

Player.prototype.seek = function(seconds) {
    if (!this.isPlaying && !this.isPaused) return this;
    if (!this.currentAudioManager || this.currentAudioManager.destroyed) return;
    var cutOff = Math.max(0.5, this.getFadeInTimeForNextTrack());
    var maxSeek = this.currentAudioManager.getDuration() - cutOff;
    if (!isFinite(maxSeek)) return;
    seconds = Math.max(0, Math.min(seconds, maxSeek));
    this.currentAudioManager.seek(seconds);
    this.currentAudioManager.updateSchedules(true);
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

Player.prototype.getAnalyzer = function() {
    if (!this.isPlaying || !this.currentAudioManager) return null;
    return this.currentAudioManager.getAnalyzer();
};

var visualizerBins = 3;
Player.visualizerBins = function(value) {
    if (value !== undefined) {
        visualizerBins = value;
    } else {
        return visualizerBins;
    }
};


function PreloadedMediaElement(track) {
    var tagData = track.getTagData();
    this.error = false;
    this.url = URL.createObjectURL(track.getFile());
    this.mediaElement =  mediaElementPool.alloc();

    this.mediaElement.autoplay = false;
    this.mediaElement.controls = false;
    this.mediaElement.loop = false;
    this.mediaElement.volume = 0;
    this.mediaElement.muted = true;
    this.mediaElement.preload = "none";

    this.track = track;
    this.timeUpdated = this.timeUpdated.bind(this);
    this.errored = this.errored.bind(this);
    this.tagDateUpated = this.tagDateUpated.bind(this);

    this.image = track.getImage();

    if (!tagData || !tagData.hasPicture()) {
        this.track.once("tagDataUpdate", this.tagDateUpated);
    }
}

PreloadedMediaElement.prototype.tagDateUpated = function() {
    this.image = this.track.getImage();
};

PreloadedMediaElement.prototype.errored = function() {
    this.error = true;
};

PreloadedMediaElement.prototype.removeListeners = function() {
    this.mediaElement.removeEventListener("timeupdate", this.timeUpdated, false);
    this.mediaElement.removeEventListener("error", this.errored, false);
    this.track.removeListener("tagDataUpdate", this.tagDateUpated);
};

PreloadedMediaElement.prototype.timeUpdated = function() {
    if (this.url && this.mediaElement) {
        var time = this.track.convertToSilenceAdjustedTime(this.mediaElement.currentTime);
        if (time > 1) {
            this.mediaElement.pause();
            this.mediaElement.currentTime = 0;
        }
    }
};

PreloadedMediaElement.prototype.startPreload = function() {
    if (this.url && this.mediaElement) {
        this.mediaElement.addEventListener("timeupdate", this.timeUpdated, false);
        this.mediaElement.addEventListener("error", this.errored, false);
        this.mediaElement.src = this.url;
        this.mediaElement.load();
        this.mediaElement.play();
    } else {
        throw new Error("already released");
    }
};

PreloadedMediaElement.prototype.destroy = function() {
    if (this.url && this.mediaElement) {
        this.removeListeners();
        mediaElementPool.free(this.mediaElement);
        URL.revokeObjectURL(this.url);
        this.track = this.url = this.mediaElement = null;
        this.image = null;
    }
};

PreloadedMediaElement.prototype.isForTrack = function(track) {
    if (!this.track || this.error || !this.mediaElement) return false;
    return this.track === track;
};

PreloadedMediaElement.prototype.release = function() {
    if (this.url && this.mediaElement) {
        this.removeListeners();
        var ret = {
            url: this.url,
            element: this.mediaElement,
            image: this.image
        };
        this.image = this.track = this.url = this.mediaElement = null;
        return ret;
    } else {
        throw new Error("already released");
    }
};

return Player;})();
