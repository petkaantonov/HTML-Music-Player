import {throttle} from "util";
import {delay} from "platform/PromiseExtensions";
import TrackWasRemovedError from "tracks/TrackWasRemovedError";
import Track from "tracks/Track";
import {ANALYZER_READY_EVENT_NAME} from "tracks/TrackAnalyzerBackend";
import {console} from "platform/platform";
import WorkerFrontend from "WorkerFrontend";

export default class TrackAnalyzer extends WorkerFrontend {
    constructor(deps) {
        super(ANALYZER_READY_EVENT_NAME, deps.workerWrapper);
        this._env = deps.env;
        this._page = deps.page;
        this._playlist = deps.playlist;
        this._player = deps.player;
        this._tagDataContext = deps.tagDataContext;
        this._globalEvents = deps.globalEvents;
        this._analyzerJobs = [];
        this._acoustIdJobs = [];
        this._nextJobId = 0;
        this._analysisQueue = [];
        this._acoustIdQueue = [];
        this._tracksAwaitingMetadataParse = [];
        this._currentlyParsingMetadata = 0;
        this._currentlyAnalysing = false;
        this._currentlyFetchingAcoustId = false;
        this._metadataParsingTracks = {};
        this._analysisFetchingTracks = {};
        this._acoustIdImageFetchingTracks = {};

        this._playlist.on(`nextTrackChange`, this.nextTrackChanged.bind(this));
        this._playlist.on(`trackPlayingStatusChange`, this.currentTrackChanged.bind(this));
        this._playlist.on(`unparsedTracksAvailable`, this.unparsedTracksAvailable.bind(this));
        this.trackRemovedWhileInQueue = this.trackRemovedWhileInQueue.bind(this);
        this.abortJobForTrack = this.abortJobForTrack.bind(this);
    }
}

TrackAnalyzer.prototype._maxMetadataParsers = function() {
    const base = this._env.isDesktop() ? 4 : 2;
    return this._player.isPlaying ? Math.floor(base / 2) : base;
};

TrackAnalyzer.prototype._metadataParserDelay = function() {
    return 0;
};

TrackAnalyzer.prototype.receiveMessage = function(event) {
    if (!event.data) return;
    if (!event.data.jobType) return;
    const {id, jobType, result, error, type, value} = event.data;

    if (error && this._env.isDevelopment()) {
        console.error(error.stack);
    }

    if (jobType === `metadata`) {
        const info = this._metadataParsingTracks[id];
        if (info) {
            const {track} = info;
            track.removeListener(`destroy`, info.destroyHandler);
            delete this._metadataParsingTracks[id];
            this.trackMetadataParsed(track, result, error);
        }
    } else if (jobType === `analysisData`) {
        const info = this._analysisFetchingTracks[id];
        if (info) {
            const {track} = info;
            track.removeListener(`destroy`, info.destroyHandler);
            delete this._analysisFetchingTracks[id];
            this.trackAnalysisDataFetched(track, result, error);
        }
    } else if (jobType === `acoustIdImage`) {
        const info = this._acoustIdImageFetchingTracks[id];
        if (info) {
            const {track} = info;
            track.removeListener(`destroy`, info.destroyHandler);
            delete this._acoustIdImageFetchingTracks[id];
            this.acoustIdImageFetched(track, result, error);
        }
    } else if (jobType === `analyze`) {
        for (let i = 0; i < this._analyzerJobs.length; ++i) {
            if (this._analyzerJobs[i].id === id) {
                const job = this._analyzerJobs[i];
                switch (type) {
                    case `progress`:
                        job.track.analysisProgress(value);
                    break;

                    case `error`: {
                        this._analyzerJobs.splice(i, 1);
                        const e = new Error(error.message);
                        e.stack = error.stack;
                        job.reject(e);
                        break;
                    }

                    case `abort`:
                        this._analyzerJobs.splice(i, 1);
                        job.reject(new TrackWasRemovedError());
                    break;

                    case `success`:
                        job.resolve(result);
                        this._analyzerJobs.splice(i, 1);
                    break;
                }
                return;
            }
        }
    } else if (jobType === `acoustId`) {
        for (let i = 0; i < this._acoustIdJobs.length; ++i) {
            if (this._acoustIdJobs[i].id === id) {
                const job = this._acoustIdJobs[i];

                switch (type) {
                    case `error`: {
                        this._acoustIdJobs.splice(i, 1);
                        const e = new Error(error.message);
                        e.stack = error.stack;
                        job.reject(e);
                        break;
                    }
                    case `success`:
                        job.resolve(result);
                        this._acoustIdJobs.splice(i, 1);
                    break;
                }
                return;
            }
        }
    }
};

TrackAnalyzer.prototype.unparsedTracksAvailable = function() {
    const tracks = this._playlist.getUnparsedTracks();
    for (let i = 0; i < tracks.length; ++i) {
        const track = tracks[i];

        if (!track.isDetachedFromPlaylist() && !track.hasError()) {
            if (track.tagData) {
                this.fetchAnalysisData(track);
            } else {
                this._tracksAwaitingMetadataParse.push(track);
            }
        }
    }

    this._metadataParsingQueueUpdated();
};

TrackAnalyzer.prototype._metadataParsingQueueUpdated = function() {
    if (this._tracksAwaitingMetadataParse.length > 0 &&
        this._currentlyParsingMetadata < this._maxMetadataParsers()) {
        this._currentlyParsingMetadata++;
        this.parseMetadata(this._tracksAwaitingMetadataParse.shift());
    }

};

TrackAnalyzer.prototype.acoustIdImageFetched = function(track, image, error) {
    track.tagData.fetchAcoustIdImageEnded(image, error);
};

TrackAnalyzer.prototype.fetchAcoustIdImage = async function(track) {
    if (track && !track.isDetachedFromPlaylist() &&
        track.tagData && track.shouldRetrieveAcoustIdImage()) {
        track.tagData.fetchAcoustIdImageStarted();
        const albumKey = track.tagData.albumNameKey();
        const {acoustId} = track.tagData;

        const id = ++this._nextJobId;
        this._acoustIdImageFetchingTracks[id] = {
            track,
            destroyHandler: () => {
                delete this._acoustIdImageFetchingTracks[id];
            }
        };

        track.once(`destroy`, this._acoustIdImageFetchingTracks[id].destroyHandler);
        const uid = await track.uid();
        this.postMessage({
            action: `fetchAcoustIdImage`,
            args: {
                id,
                uid,
                transientId: track.transientId(),
                albumKey,
                acoustId
            }
        });
    }
};
TrackAnalyzer.prototype.fetchAcoustIdImage = throttle(TrackAnalyzer.prototype.fetchAcoustIdImage, 100);

TrackAnalyzer.prototype.fillInAcoustId = async function(track, duration, fingerprint) {
    if (this._playlist.isTrackHighlyRelevant(track)) {
        this.prioritize(track);
    }

    let acoustId;
    try {
        acoustId = await this.fetchTrackAcoustId(track, {duration, fingerprint});
        if (track.isDetachedFromPlaylist()) {
            return;
        }
    } catch (e) {
        if (!(e instanceof TrackWasRemovedError)) {
            throw e;
        }
    }
    track.tagData.setAcoustId(acoustId);
    if (this._playlist.isTrackHighlyRelevant(track)) {
        this.fetchAcoustIdImage(track);
    }

};

TrackAnalyzer.prototype.trackAnalysisDataFetched = async function(track, dbResult, error) {
    if (error && this._env.isDevelopment()) {
        console.error(error);
    }

    const result = dbResult && dbResult.duration ? dbResult : null;
    if (!track.isDetachedFromPlaylist() && !error) {
        this.emit(`metadataUpdate`);
        let needFingerprint = !track.tagData.hasSufficientMetadata();
        let needLoudness = true;

        if (result) {
            needFingerprint = needFingerprint ? !result.fingerprint : false;
            needLoudness = !result.loudness;


            track.tagData.setDataFromTagDatabase(result);

            if (result.fingerprint && this._playlist.isTrackHighlyRelevant(track)) {
                this.fetchAcoustIdImage(track);
            }
        }

        let acoustIdFilled = null;
        if (result && !result.acoustId && result.fingerprint && result.duration) {
            acoustIdFilled = this.fillInAcoustId(track, result.duration, result.fingerprint);
        }

        if (needFingerprint || needLoudness) {
            const opts = {
                fingerprint: needFingerprint,
                loudness: needLoudness
            };
            try {
                track.setAnalysisStatus(opts);
                const analysis = await this.analyzeTrack(track, opts);
                const {duration} = analysis;
                let {fingerprint, loudness} = analysis;

                if (result) {
                    fingerprint = needFingerprint ? fingerprint : result.fingerprint || null;
                    loudness = needLoudness ? loudness : result.loudness;
                } else {
                    track.tagData.setDataFromTagDatabase(analysis);
                }

                if (needLoudness) {
                    track.tagData.setLoudness(loudness);
                }

                if (needFingerprint && !acoustIdFilled) {
                    this.fillInAcoustId(track, duration, fingerprint);
                }
                this.emit(`metadataUpdate`);
            } catch (e) {
                if (!(e instanceof TrackWasRemovedError)) {
                    throw e;
                }
            } finally {
                track.unsetAnalysisStatus();
            }
        }
    }
};

TrackAnalyzer.prototype.fetchAnalysisData = async function(track) {
    if (track.tagData.hasBeenAnalyzed()) return;
    const id = ++this._nextJobId;
    this._analysisFetchingTracks[id] = {
        track,
        destroyHandler: () => {
            delete this._analysisFetchingTracks[id];
        }
    };

    track.once(`destroy`, this._analysisFetchingTracks[id].destroyHandler);
    const uid = await track.uid();
    this.postMessage({
        action: `fetchAnalysisData`,
        args: {
            id,
            uid,
            transientId: track.transientId(),
            albumKey: track.tagData.albumNameKey()
        }
    });
};

TrackAnalyzer.prototype.trackMetadataParsed = async function(track, data, error) {
    if (error && this._env.isDevelopment()) {
        console.error(error);
    }

    try {
        if (!track.isDetachedFromPlaylist() && !error) {
            const tagData = this._tagDataContext.create(track, data);
            track.setTagData(tagData);
            this.emit(`metadataUpdate`);
            this.fetchAnalysisData(track);
        }
    } finally {
        const delayMs = this._metadataParserDelay();
        if (delayMs > 0) {
            await delay(delayMs);
        }
        this._currentlyParsingMetadata--;
        this._metadataParsingQueueUpdated();
    }
};

const removeFromQueue = function(queue, track) {
    for (let i = 0; i < queue.length; ++i) {
        const spec = queue[i];
        if (spec.track === track) {
            queue.splice(i, 1);
            break;
        }
    }
};

TrackAnalyzer.prototype.trackRemovedWhileInQueue = function(track) {
    removeFromQueue(this._analysisQueue, track);
    removeFromQueue(this._acoustIdQueue, track);
};

TrackAnalyzer.prototype._next = function(queue, statusProp, method) {
    while (queue.length > 0) {
        const spec = queue.shift();
        spec.track.removeListener(`destroy`, this.trackRemovedWhileInQueue);
        if (spec.track.isDetachedFromPlaylist()) {
            spec.reject(new TrackWasRemovedError());
        } else {
            this[statusProp] = false;
            spec.resolve(method.call(this, spec.track, spec.opts));
            return;
        }
    }
    this[statusProp] = false;
};

TrackAnalyzer.prototype.currentTrackChanged = function(track) {
    this.prioritize(track);
    this.fetchAcoustIdImage(track);
};

TrackAnalyzer.prototype.nextTrackChanged = function(track) {
    this.prioritize(track);
    this.fetchAcoustIdImage(track);
};

const prioritizeQueue = function(track, queue) {
    for (let i = 0; i < queue.length; ++i) {
        const spec = queue[i];

        if (spec.track === track) {
            for (let j = i; j >= 1; --j) {
                queue[j] = queue[j - 1];
            }
            queue[0] = spec;
            break;
        }
    }
};

TrackAnalyzer.prototype.prioritize = function(track) {
    if (track instanceof Track && track.tagData) {
        prioritizeQueue(track, this._analysisQueue);
        prioritizeQueue(track, this._acoustIdQueue);
    }
};

TrackAnalyzer.prototype.abortJobForTrack = function(track) {
    for (let i = 0; i < this._analyzerJobs.length; ++i) {
        if (this._analyzerJobs[i].track === track) {
            this.postMessage({
                action: `abort`,
                args: {
                    id: this._analyzerJobs[i].id
                }
            });
        }
    }
};

TrackAnalyzer.prototype.parseMetadata = function(track) {
    const id = ++this._nextJobId;
    this._metadataParsingTracks[id] = {
        track,
        destroyHandler: () => {
            delete this._metadataParsingTracks[id];
        }
    };
    track.once(`destroy`, this._metadataParsingTracks[id].destroyHandler);
    this.postMessage({
        action: `parseMetadata`,
        args: {
            id,
            file: track.getFile(),
            transientId: track.transientId()
        }
    });
};

TrackAnalyzer.prototype.fetchTrackAcoustId = async function(track, opts) {
    if (this._currentlyFetchingAcoustId) {
        track.once(`destroy`, this.trackRemovedWhileInQueue);
        return new Promise((resolve, reject) => {
            this._acoustIdQueue.push({
                track,
                resolve,
                reject,
                opts
            });

            if (this._playlist.isTrackHighlyRelevant(track)) {
                this.prioritize(track);
            }
        });
    }

    const uid = await track.uid();
    this._currentlyFetchingAcoustId = true;
    const id = ++this._nextJobId;
    try {
        return await new Promise((resolve, reject) => {
            if (track.isDetachedFromPlaylist()) {
                throw new TrackWasRemovedError();
            }

            this._acoustIdJobs.push({
                id,
                track,
                resolve,
                reject
            });

            this.postMessage({
                action: `fetchAcoustId`,
                args: {
                    id,
                    duration: opts.duration,
                    fingerprint: opts.fingerprint,
                    uid,
                    transientId: track.transientId()
                }
            });
        });
    } finally {
        await delay(1000);
        this._next(this._acoustIdQueue, `_currentlyFetchingAcoustId`, this.fetchTrackAcoustId);
    }
};

TrackAnalyzer.prototype.analyzeTrack = async function(track, opts) {
    if (this._currentlyAnalysing) {
        track.once(`destroy`, this.trackRemovedWhileInQueue);
        return new Promise((resolve, reject) => {
            this._analysisQueue.push({
                track,
                opts,
                resolve,
                reject
            });

            if (this._playlist.isTrackHighlyRelevant(track)) {
                this.prioritize(track);
            }
        });
    }

    const uid = await track.uid();
    this._currentlyAnalysing = true;
    const id = ++this._nextJobId;
    track.once(`destroy`, this.abortJobForTrack);
    try {
        return await new Promise((resolve, reject) => {
            if (track.isDetachedFromPlaylist()) {
                throw new TrackWasRemovedError();
            }

            this._analyzerJobs.push({
                id,
                track,
                resolve,
                reject
            });

            this.postMessage({
                action: `analyze`,
                args: {
                    id,
                    fingerprint: !!opts.fingerprint,
                    loudness: !!opts.loudness,
                    file: track.getFile(),
                    uid,
                    transientId: track.transientId()
                }
            });
        });
    } finally {
        track.removeListener(`destroy`, this.abortJobForTrack);
        this._next(this._analysisQueue, `_currentlyAnalysing`, this.analyzeTrack);
    }
};
