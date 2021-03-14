import EventEmitter from "events";
import { delay as promiseDelay } from "src/util";
import { CancellationError, CancellationToken } from "src/utils/CancellationToken";

import { PromiseReject, PromiseResolve, UnwrapPromise } from "../../src/types/helpers";

export const JOB_COMPLETE_EVENT = `jobComplete`;
export const ALL_JOBS_COMPLETE_EVENT = `allJobsComplete`;

type JobCallback<T extends any[], R> = (job: Job<T, R>, ...args: T) => R;

class Job<T extends any[], R> {
    cancellationToken: CancellationToken<this>;
    id: number;
    resolve: PromiseResolve<UnwrapPromise<R>>;
    reject: PromiseReject;
    args: T;
    cancelId: number;
    promise: Promise<UnwrapPromise<R>> | null;
    constructor(id: number, resolve: PromiseResolve<UnwrapPromise<R>>, reject: PromiseReject, args: T) {
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

interface PromisedJob<T extends any[], R> extends Job<T, R> {
    promise: Promise<UnwrapPromise<R>>;
}

interface Opts<T extends any[], R> {
    parallelJobs?: number;
    delay?: number;
    jobCallback: JobCallback<T, R>;
}

export default class JobProcessor<T extends any[], R> extends EventEmitter {
    _jobId: number;
    _delay: number;
    _parallelJobs: number;
    _queuedJobs: Job<T, R>[];
    _activeJobs: Job<T, R>[];
    _jobCallback: JobCallback<T, R>;
    _allJobsPersistedEmitted: boolean;
    constructor({ parallelJobs = 1, delay = 0, jobCallback }: Opts<T, R>) {
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
        if (this.jobsActive < this._parallelJobs && this._queuedJobs.length > 0) {
            let job: Job<T, R> | undefined = this._queuedJobs.shift()!;

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
                    job.resolve(result as any);
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
            void this._next();
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
            const job = this._activeJobs[0]!;
            const signal = job.cancellationToken.getSignal();
            job.cancel();
            await signal;
        }
    }

    async cancelJobOfId(jobId: number) {
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

    postJob(...args: T): PromisedJob<T, UnwrapPromise<R>> {
        let job: Job<T, R> | undefined;

        const promise = new Promise<UnwrapPromise<R>>((resolve, reject) => {
            job = new Job<T, R>(++this._jobId, resolve, reject, args);
            this._queuedJobs.push(job);
        });
        (job as any).promise = promise;
        void this._next();
        return job as any;
    }
}
