import {throttle, delay} from "util";
import TrackWasRemovedError from "tracks/TrackWasRemovedError";
import {default as Track, DECODE_ERROR, FILESYSTEM_ACCESS_ERROR} from "tracks/Track";
import {ANALYZER_READY_EVENT_NAME} from "tracks/TrackAnalyzerBackend";
import {console} from "platform/platform";
import WorkerFrontend from "WorkerFrontend";

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

const removeFromQueue = function(queue, track) {
    for (let i = 0; i < queue.length; ++i) {
        const spec = queue[i];
        if (spec.track === track) {
            queue.splice(i, 1);
            break;
        }
    }
};

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

    receiveMessage(event) {
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
                            e.name = error.name;
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
    }

    unparsedTracksAvailable() {
        const tracks = this._playlist.getUnparsedTracks();
        for (let i = 0; i < tracks.length; ++i) {
            const track = tracks[i];

            if (!track.isDetachedFromPlaylist() && !track.hasError()) {
                if (track.tagData) {
                    this.fetchAnalysisData(track);
                } else {
                    this.parseMetadata(track);
                }
            }
        }
    }

    acoustIdImageFetched(track, image, error) {
        track.tagData.fetchAcoustIdImageEnded(image, error);
    }

    async fetchAcoustIdImage(track) {
        if (track && !track.isDetachedFromPlaylist() &&
            track.tagData && track.shouldRetrieveAcoustIdImage()) {
            track.tagData.fetchAcoustIdImageStarted();
            const albumKey = track.tagData.albumNameKey();
            const {acoustIdCoverArt} = track.tagData;

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
                    acoustIdCoverArt
                }
            });
        }
    }

    async fillInAcoustId(track, duration, fingerprint) {
        if (this._playlist.isTrackHighlyRelevant(track)) {
            this.prioritize(track);
        }

        let acoustIdResult;
        try {
            acoustIdResult = await this.fetchTrackAcoustId(track, {duration, fingerprint});
            if (track.isDetachedFromPlaylist()) {
                return;
            }
        } catch (e) {
            if (!(e instanceof TrackWasRemovedError)) {
                throw e;
            }
        }
        track.tagData.setAcoustIdCoverArt(acoustIdResult.acoustIdCoverArt);
        if (this._playlist.isTrackHighlyRelevant(track)) {
            this.fetchAcoustIdImage(track);
        }

        if (acoustIdResult.metadataUpdated) {
            track.tagData.setDataFromTagDatabase(acoustIdResult.metadata);
            this.emit(`metadataUpdate`);
        }
    }

    async trackAnalysisDataFetched(track, result, error) {
        if (error && this._env.isDevelopment()) {
            console.error(error);
        }

        if (!track.isDetachedFromPlaylist() && !error) {
            track.tagData.setDataFromTagDatabase(result);
            let needFingerprint = !track.tagData.hasSufficientMetadata();
            let acoustIdFilled = null;
            needFingerprint = needFingerprint ? !result.fingerprint : false;

            if (result.fingerprint && this._playlist.isTrackHighlyRelevant(track)) {
                this.fetchAcoustIdImage(track);
            }

            if (!result.acoustIdCoverArt && result.acoustIdCoverArt !== null &&
                result.fingerprint && result.duration) {
                acoustIdFilled = this.fillInAcoustId(track, result.duration, result.fingerprint);
            }

            this.emit(`metadataUpdate`);
            if (needFingerprint) {
                try {
                    const analysis = await this.analyzeTrack(track);
                    const {duration} = analysis;
                    let {fingerprint} = analysis;

                    if (result) {
                        fingerprint = needFingerprint ? fingerprint : result.fingerprint || null;
                    } else {
                        track.tagData.setDataFromTagDatabase(analysis);
                    }

                    if (needFingerprint && !acoustIdFilled) {
                        this.fillInAcoustId(track, duration, fingerprint);
                    }
                    this.emit(`metadataUpdate`);
                } catch (e) {
                    if (!(e instanceof TrackWasRemovedError)) {
                        let trackError;
                        if (e.name === `TrackAnalysisError`) {
                            trackError = DECODE_ERROR;
                        } else if (e.name === `NotFoundError` || e.name === `NotReadableError`) {
                            trackError = FILESYSTEM_ACCESS_ERROR;
                        } else {
                            throw e;
                        }
                        track.setError(trackError);
                    }
                }
            }
        }
    }

    async fetchAnalysisData(track) {
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
    }

    trackMetadataParsed(track, data, error) {
        if (error && this._env.isDevelopment()) {
            console.error(error);
        }

        if (!track.isDetachedFromPlaylist() && !error) {
            const tagData = this._tagDataContext.create(track, data);
            track.setTagData(tagData);
            this.emit(`metadataUpdate`);
            this.fetchAnalysisData(track);
        }
    }

    trackRemovedWhileInQueue(track) {
        removeFromQueue(this._analysisQueue, track);
        removeFromQueue(this._acoustIdQueue, track);
    }

    _next(queue, statusProp, method) {
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
    }

    currentTrackChanged(track) {
        this.prioritize(track);
        this.fetchAcoustIdImage(track);
    }

    nextTrackChanged(track) {
        this.prioritize(track);
        this.fetchAcoustIdImage(track);
    }

    prioritize(track) {
        if (track instanceof Track && track.tagData) {
            prioritizeQueue(track, this._analysisQueue);
            prioritizeQueue(track, this._acoustIdQueue);
        }
    }

    abortJobForTrack(track) {
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
    }

    async parseMetadata(track) {
        const id = ++this._nextJobId;
        this._metadataParsingTracks[id] = {
            track,
            destroyHandler: () => {
                delete this._metadataParsingTracks[id];
            }
        };
        track.once(`destroy`, this._metadataParsingTracks[id].destroyHandler);
        const uid = await track.uid();
        this.postMessage({
            action: `parseMetadata`,
            args: {
                id,
                uid,
                file: track.getFile(),
                transientId: track.transientId()
            }
        });
    }

    async fetchTrackAcoustId(track, opts) {
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
    }

    async analyzeTrack(track) {
        if (this._currentlyAnalysing) {
            track.once(`destroy`, this.trackRemovedWhileInQueue);
            return new Promise((resolve, reject) => {
                this._analysisQueue.push({
                    track,
                    resolve,
                    reject,
                    opts: null
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
    }

}

TrackAnalyzer.prototype.fetchAcoustIdImage = throttle(TrackAnalyzer.prototype.fetchAcoustIdImage, 100);
