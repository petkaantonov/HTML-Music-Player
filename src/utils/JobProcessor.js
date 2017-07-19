import {delay as promiseDelay} from "util";
import {CancellationToken, CancellationError} from "utils/CancellationToken";

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

export default class JobProcessor {
    constructor({
        parallelJobs = 1,
        delay = 0,
        jobCallback
    }) {
        this._jobId = 0;
        this._delay = delay;
        this._parallelJobs = parallelJobs;
        this._queuedJobs = [];
        this._activeJobs = [];
        this._jobCallback = jobCallback;
    }

    get jobsActive() {
        return this._activeJobs.length;
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
            if (this._delay > 0) {
                await promiseDelay(this._delay);
            }
            try {
                const resultPromise = Promise.resolve(this._jobCallback(job, ...job.args));
                const result = await resultPromise;
                const i = this._activeJobs.indexOf(job);
                this._activeJobs.splice(i, 1);
                if (!job.isCancelled()) {
                    job.resolve(result);
                } else {
                    job.reject(new CancellationError());
                }
            } catch (e) {
                const i = this._activeJobs.indexOf(job);
                this._activeJobs.splice(i, 1);
                job.reject(e);
            }
            this._next();
        }
    }

    cancelActiveJobs() {
        for (const job of this._activeJobs) {
            job.cancel();
        }
    }

    cancelJobOfId(jobId) {
        for (const job of this._activeJobs) {
            if (job.id === jobId) {
                job.cancel();
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
