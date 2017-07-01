import AbstractBackend from "AbstractBackend";
import {parse as parseMetadata, fetchAnalysisData} from "audio/MetadataParser";
import TrackAnalysisJob from "tracks/TrackAnalysisJob";
import {fetchAcoustId, fetchAcoustIdImage} from "audio/AcoustId";
import TagDatabase from "tracks/TagDatabase";
import {CancellationError} from "utils/CancellationToken";

export const ANALYZER_READY_EVENT_NAME = `analyzerReady`;

// Utilize 75% of one core.
const MAX_CPU_UTILIZATION = 0.75;

export default class TrackAnalyzerBackend extends AbstractBackend {
    constructor(wasm) {
        super(ANALYZER_READY_EVENT_NAME);
        this.db = new TagDatabase();
        this.wasm = wasm;
        this.cpuUtilization = MAX_CPU_UTILIZATION;
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

            // TODO import static methods
            async parseMetadata({file, transientId, id}) {
                const metadata = await this.promiseMessageSuccessErrorHandler(id, parseMetadata(file, transientId), `metadata`);
                if (metadata) {
                    this.emit(`metadataParsed`, {file, metadata, transientId});
                }

            },

            fetchAnalysisData({uid, albumKey, id}) {
                this.promiseMessageSuccessErrorHandler(id, fetchAnalysisData(this.db, uid, albumKey), `analysisData`);
            },

            fetchAcoustId({id, uid, fingerprint, duration}) {
                this.promiseMessageSuccessErrorHandler(id, fetchAcoustId(this.db, uid, fingerprint, duration), `acoustId`);
            },

            fetchAcoustIdImage({id, albumKey, acoustId}) {
                this.promiseMessageSuccessErrorHandler(id, fetchAcoustIdImage(this.db, acoustId, albumKey), `acoustIdImage`);
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
                stack: e.stack
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
        const job = new TrackAnalysisJob(this, jobArgs);
        this.currentJob = job;

        try {
            const result = await job.analyze();
            // Await this.db.insert(job.uid, result);
            this.reportSuccess(job.id, result);
        } catch (e) {
            if (e && e instanceof CancellationError) {
                this.reportAbort(job.id);
            } else {
                this.reportError(job.id, e);
            }
        } finally {
            job.destroy();
            this.nextJob();
        }
    }
}
