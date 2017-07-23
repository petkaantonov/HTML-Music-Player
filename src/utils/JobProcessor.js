import {delay as promiseDelay} from "util";
import {CancellationToken, CancellationError} from "utils/CancellationToken";
import EventEmitter from "events";

export const JOB_COMPLETE_EVENT = `jobComplete`;
export const ALL_JOBS_COMPLETE_EVENT = `allJobsComplete`;

class Job {
    constructor(id, resolve, reject, args) {
        this.id = id;
        this.resolve = resolve;
        this.reject = reject;
        this.args = args;
        this.cancelId = 0;
        this.promise = null;
        this.cancellationToken = new CancellationToken(this, `cancelId`);
    }

    cancel() {
        this.cancelId++;
    }

    isCancelled() {
        return this.cancellationToken.isCancelled();
    }
}

export default class JobProcessor extends EventEmitter {
    constructor({
        parallelJobs = 1,
        delay = 0,
        jobCallback
    }) {
        super();
        this._jobId = 0;
        this._delay = delay;
        this._parallelJobs = parallelJobs;
        this._queuedJobs = [];
        this._activeJobs = [];
        this._jobCallback = jobCallback;
        this._allJobsPersistedEmitted = false;
    }

    get parallelJobs() {
        return this._parallelJobs;
    }

    get jobsActive() {
        return this._activeJobs.length;
    }

    get jobsQueued() {
        return this._queuedJobs.length;
    }

    async _next() {
        if (this.jobsActive < this._parallelJobs &&
            this._queuedJobs.length > 0) {

            let job = this._queuedJobs.shift();

            while (job.isCancelled()) {
                job = this._queuedJobs.shift();
                if (!job) {
                    return;
                }
            }

            this._activeJobs.push(job);
            this._allJobsPersistedEmitted = false;
            if (this._delay > 0) {
                await promiseDelay(this._delay);
            }
            if (job.isCancelled()) {
                job.cancellationToken.signal();
                job.reject(new CancellationError());
            }
            try {
                const resultPromise = Promise.resolve(this._jobCallback(job, ...job.args));
                const result = await resultPromise;
                const i = this._activeJobs.indexOf(job);
                this._activeJobs.splice(i, 1);
                if (!job.isCancelled()) {
                    job.resolve(result);
                } else {
                    job.cancellationToken.signal();
                    job.reject(new CancellationError());
                }
            } catch (e) {
                const i = this._activeJobs.indexOf(job);
                this._activeJobs.splice(i, 1);
                if (!job.isCancelled()) {
                    job.reject(e);
                } else {
                    job.cancellationToken.signal();
                    job.reject(new CancellationError());
                }
            }
            this.emit(JOB_COMPLETE_EVENT, job);
            this._next();
        }

        await promiseDelay(1000);
        if (this.jobsActive === 0 && this.jobsQueued === 0 && !this._allJobsPersistedEmitted) {
            this._allJobsPersistedEmitted = true;
            this.emit(ALL_JOBS_COMPLETE_EVENT);
        }
    }

    async cancelActiveJobs() {
        const ret = [];
        for (const job of this._activeJobs) {
            ret.push(job.cancellationToken.getSignal());
            job.cancel();
        }
        await Promise.all(ret);
    }

    async cancelOldestJob() {
        if (this.jobsActive > 0) {
            const job = this._activeJobs[0];
            const signal = job.cancellationToken.getSignal();
            job.cancel();
            await signal;
        }
    }

    async cancelJobOfId(jobId) {
        for (const job of this._activeJobs) {
            if (job.id === jobId) {
                const signal = job.cancellationToken.getSignal();
                job.cancel();
                await signal;
                return;
            }
        }

        for (const job of this._queuedJobs) {
            if (job.id === jobId) {
                job.cancel();
                return;
            }
        }
    }

    postJob(...args) {
        let job;

        const promise = new Promise((resolve, reject) => {
            job = new Job(++this._jobId, resolve, reject, args);
            this._queuedJobs.push(job);
        });
        job.promise = promise;
        this._next();
        return job;
    }
}
