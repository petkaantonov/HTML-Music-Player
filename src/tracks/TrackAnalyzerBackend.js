import AbstractBackend from "AbstractBackend";
import TrackAnalysisJob from "tracks/TrackAnalysisJob";
import {CancellationError} from "utils/CancellationToken";

export const ANALYZER_READY_EVENT_NAME = `analyzerReady`;

class AcoustIdDataFetcher {
    constructor(backend, db, metadataManager, timers) {
        this.backend = backend;
        this.db = db;
        this.metadataManager = metadataManager;
        this.timerId = -1;
        this.timers = timers;
        this._idle = this._idle.bind(this);
        this._idle();
    }

    async _idle() {
        this.timerId = -1;
        let waitLongTime = false;
        const job = await this.db.getAcoustIdFetchJob();
        if (job) {
            const {trackUid, fingerprint, duration, jobId} = job;
            try {
                const result = await this.metadataManager.fetchAcoustId(trackUid, fingerprint, duration);
                await this.db.completeAcoustIdFetchJob(jobId);
                this.backend.reportAcoustIdDataFetched(result);
            } catch (e) {
                waitLongTime = true;
                self.uiLog(e.stack);
                await this.db.setAcoustIdFetchJobError(jobId, e);
            } finally {
                this.timerId = this.timers.setTimeout(this._idle, waitLongTime ? 60000 : 1000);
            }
        }
    }

    async postJob(uid, fingerprint, duration) {
        await this.db.addAcoustIdFetchJob(uid, fingerprint, duration);
        if (this.timerId === -1) {
            this._idle();
        }
    }
}

export default class TrackAnalyzerBackend extends AbstractBackend {
    constructor(wasm, db, metadataManager, timers) {
        super(ANALYZER_READY_EVENT_NAME);
        this.db = db;
        this.timers = timers;
        this.metadataManager = metadataManager;
        this.wasm = wasm;
        this.analysisQueue = [];
        this.currentJob = null;
        this.acoustIdDataFetcher = new AcoustIdDataFetcher(this, this.db, metadataManager, timers);
        this.actions = {
            analyze(args) {
                this.analysisQueue.push(args);
                if (!this.processing) this.nextJob();
            },

            abort(args) {
                const jobId = args.id;
                if (this.currentJob.id === jobId) {
                    this.currentJob.abort();
                } else {
                    const index = this.analysisQueue.findIndex(v => v.id === jobId);
                    if (index >= 0) {
                        const job = this.analysisQueue[index];
                        job.destroy();
                        this.analysisQueue.splice(index, 1);
                        this.reportAnalyzerAbort(job.id);
                    }
                }
            },

            async getAlbumArt({trackUid, artist, album, preference, requestReason}) {
                const albumArt = await this.metadataManager.getAlbumArt(trackUid, artist, album, preference);
                const result = {albumArt, trackUid, preference, requestReason};
                this.postMessage({type: `albumArtResult`, result});
            },

            async parseMetadata({file, transientId, id, uid}) {
                const promise = this.metadataManager.parse(file, uid);
                const metadata = await this.promiseMessageSuccessErrorHandler(id, promise, `metadata`);
                if (metadata) {
                    this.emit(`metadataParsed`, {file, metadata, transientId, uid});
                }

            }
        };
    }

    get processing() {
        return !!this.currentJob;
    }

    reportAcoustIdDataFetched(result) {
        this.postMessage({type: `acoustIdDataFetched`, result});
    }

    reportAnalyzerAbort(id) {
        this.postMessage({id, type: `abort`, jobType: `analyze`});
    }

    reportAnalyzerError(id, e) {
        this.postMessage({
            id,
            type: `error`,
            jobType: `analyze`,
            error: {
                message: e.message,
                stack: e.stack,
                name: e.name
            }
        });
    }

    reportAnalyzerSuccess(id) {
        this.postMessage({id, type: `success`, jobType: `analyze`});
    }

    async promiseMessageSuccessErrorHandler(id, p, jobType) {
        try {
            const result = await p;
            const type = `success`;
            this.postMessage({id, result, jobType, type});
            return result;
        } catch (e) {
            const type = `error`;
            const {message, stack} = e;
            this.postMessage({id, type, jobType, error: {message, stack}});
            return null;
        }
    }

    async nextJob() {
        this.currentJob = null;

        if (this.analysisQueue.length === 0) {
            return;
        }

        const jobArgs = this.analysisQueue.shift();
        const {id, uid, file} = jobArgs;
        const job = new TrackAnalysisJob(this, file, uid);
        this.currentJob = job;

        try {
            const result = await job.analyze();
            this.acoustIdDataFetcher.postJob(uid, result.fingerprint, result.duration);
            this.db.updateHasBeenAnalyzed(uid, true);
            this.reportAnalyzerSuccess(id);
        } catch (e) {
            if (e && e instanceof CancellationError) {
                this.reportAnalyzerAbort(id);
            } else {
                this.reportAnalyzerError(id, e);
            }
        } finally {
            try {
                job.destroy();
            } finally {
                this.nextJob();
            }
        }
    }
}
