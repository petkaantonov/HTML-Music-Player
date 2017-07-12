import AbstractBackend from "AbstractBackend";
import TrackAnalysisJob from "tracks/TrackAnalysisJob";
import {CancellationError} from "utils/CancellationToken";

export const ANALYZER_READY_EVENT_NAME = `analyzerReady`;

export default class TrackAnalyzerBackend extends AbstractBackend {
    constructor(wasm, db, metadataParser) {
        super(ANALYZER_READY_EVENT_NAME);
        this.db = db;
        this.metadataParser = metadataParser;
        this.wasm = wasm;
        this.analysisQueue = [];
        this.currentJob = null;
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
                        this.reportAbort(job.id);
                    }
                }
            },

            async parseMetadata({file, transientId, id}) {
                const promise = this.metadataParser.parse(file);
                const metadata = await this.promiseMessageSuccessErrorHandler(id, promise, `metadata`);
                if (metadata) {
                    this.emit(`metadataParsed`, {file, metadata, transientId});
                }

            },

            fetchAnalysisData({uid, albumKey, id}) {
                const promise = this.metadataParser.fetchAnalysisData(uid, albumKey);
                this.promiseMessageSuccessErrorHandler(id, promise, `analysisData`);
            },

            fetchAcoustId({id, uid, fingerprint, duration}) {
                const promise = this.metadataParser.fetchAcoustId(uid, fingerprint, duration);
                this.promiseMessageSuccessErrorHandler(id, promise, `acoustId`);
            },

            fetchAcoustIdImage({id, albumKey, acoustId}) {
                const promise = this.metadataParser.fetchAcoustIdImage(acoustId, albumKey);
                this.promiseMessageSuccessErrorHandler(id, promise, `acoustIdImage`);
            }
        };
    }

    get processing() {
        return !!this.currentJob;
    }

    reportAbort(id) {
        this.postMessage({
            id,
            type: `abort`,
            jobType: `analyze`
        });
    }

    reportProgress(id, value) {
        this.postMessage({
            id,
            type: `progress`,
            value,
            jobType: `analyze`
        });
    }

    reportError(id, e) {
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

    reportSuccess(id, result) {
        this.postMessage({
            id,
            type: `success`,
            jobType: `analyze`,
            result
        });
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
        const job = new TrackAnalysisJob(this, file);
        this.currentJob = job;

        try {
            const result = await job.analyze();
            await this.db.insert(uid, result);
            this.reportSuccess(id, result);
        } catch (e) {
            if (e && e instanceof CancellationError) {
                this.reportAbort(id);
            } else {
                this.reportError(id, e);
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
