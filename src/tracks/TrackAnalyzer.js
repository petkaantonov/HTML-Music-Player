import {throttle} from "util";
import TrackWasRemovedError from "tracks/TrackWasRemovedError";
import {default as Track, byUid as trackByUid} from "tracks/Track";
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

function acoustIdImageFetched(track, image, error) {
    track.tagData.fetchAcoustIdImageEnded(image, error);
}

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
        this._nextJobId = 0;
        this._analysisQueue = [];
        this._currentlyAnalysing = false;
        this._metadataParsingTracks = {};
        this._acoustIdImageFetchingTracks = {};

        this._playlist.on(`nextTrackChange`, this.nextTrackChanged.bind(this));
        this._playlist.on(`trackPlayingStatusChange`, this.currentTrackChanged.bind(this));
        this._playlist.on(`unparsedTracksAvailable`, this.unparsedTracksAvailable.bind(this));
        this.trackRemovedWhileInQueue = this.trackRemovedWhileInQueue.bind(this);
        this.abortJobForTrack = this.abortJobForTrack.bind(this);
    }

    receiveMessage(event) {
        if (!event.data) return;
        const {id, jobType, result, error, type} = event.data;

        if (error && this._env.isDevelopment()) {
            console.error(error.stack);
        }

        if (type === `acoustIdDataFetched`) {
            this.acoustIdDataFetched(result);
        } else if (jobType === `metadata`) {
            const info = this._metadataParsingTracks[id];
            if (info) {
                const {track} = info;
                track.removeListener(`destroy`, info.destroyHandler);
                delete this._metadataParsingTracks[id];
                this.trackMetadataParsed(track, result, error);
            }
        } else if (jobType === `acoustIdImage`) {
            const info = this._acoustIdImageFetchingTracks[id];
            if (info) {
                const {track} = info;
                track.removeListener(`destroy`, info.destroyHandler);
                delete this._acoustIdImageFetchingTracks[id];
                acoustIdImageFetched(track, result, error);
            }
        } else if (jobType === `analyze`) {
            for (let i = 0; i < this._analyzerJobs.length; ++i) {
                if (this._analyzerJobs[i].id === id) {
                    const job = this._analyzerJobs[i];
                    switch (type) {
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
                            job.resolve();
                            this._analyzerJobs.splice(i, 1);
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
                if (!track.tagData) {
                    this.parseMetadata(track);
                } else if (!track.hasBeenAnalyzed()) {
                    this.analyzeTrack(track);
                }
            }
        }
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

    acoustIdDataFetched(acoustIdResult) {
        const {trackInfo, trackInfoUpdated} = acoustIdResult;
        const {trackUid} = trackInfo;

        const track = trackByUid(trackUid);
        if (!track) {
            return;
        }
        track.setHasAcoustIdBeenFetched();

        if (trackInfoUpdated) {
            track.tagData.updateFields(trackInfo);
            track.tagDataUpdated();
            this.emit(`metadataUpdate`);
        }

        if (this._playlist.isTrackHighlyRelevant(track)) {
            this.fetchAcoustIdImage(track);
        }
    }

    trackMetadataParsed(track, trackInfo, error) {
        if (error && this._env.isDevelopment()) {
            console.error(error);
        }

        if (!track.isDetachedFromPlaylist()) {
            if (error) {
                track.setError(error && error.message || `${error}`);
            } else {
                const tagData = this._tagDataContext.create(track, trackInfo);
                track.setTagData(tagData);
                this.emit(`metadataUpdate`);
                if (!track.hasBeenAnalyzed()) {
                    this.analyzeTrack(track);
                }
            }
        }
    }

    trackRemovedWhileInQueue(track) {
        removeFromQueue(this._analysisQueue, track);
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

    async analyzeTrack(track) {
        try {
            if (this._currentlyAnalysing) {
                track.once(`destroy`, this.trackRemovedWhileInQueue);
                await new Promise((resolve, reject) => {
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
                return;
            }
            const uid = await track.uid();
            this._currentlyAnalysing = true;
            const id = ++this._nextJobId;
            track.once(`destroy`, this.abortJobForTrack);
            try {
                await new Promise((resolve, reject) => {
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
                track.setHasBeenAnalyzed();
            } finally {
                track.removeListener(`destroy`, this.abortJobForTrack);
                this._next(this._analysisQueue, `_currentlyAnalysing`, this.analyzeTrack);
            }
        } catch (e) {
            if (!(e instanceof TrackWasRemovedError)) {
                throw e;
            }
        }
    }

}

TrackAnalyzer.prototype.fetchAcoustIdImage = throttle(TrackAnalyzer.prototype.fetchAcoustIdImage, 100);
