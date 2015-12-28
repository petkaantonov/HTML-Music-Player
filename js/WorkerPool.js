"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird.js");

const EventEmitter = require("events");
const util = require("./util");

var runningId = 0;
var WORKER_THREAD = 0;
var MAIN_THREAD = 1;

function PoolWorker(pool, url) {
    EventEmitter.call(this);
    this.pool = pool;
    this.url = url;
    this.worker = new Worker(url);

    this.workerQueue = [];
    this.mainQueue = [];

    this.workerVacant = true;
    this.mainVacant = true;

    this.currentWorkerWork = null;
    this.currentMainWork = null;

    this._onMessage = $.proxy(this._onMessage, this);
    this._onError = $.proxy(this._onError, this);
    this.worker.addEventListener("message", this._onMessage, false);
    this.worker.addEventListener("error", this._onError, false);
}
util.inherits(PoolWorker, EventEmitter);

PoolWorker.prototype._onError = function(e) {
    var err = new Error(e.message);
    err.stack = e.filename + ":" + e.lineno;
    var currentWork = this.currentWorkerWork;
    this.currentWorkerWork = null;

    if (currentWork) {
        currentWork.reject(err);
        this._workerNext();
    } else {
        throw err;
    }
};

PoolWorker.prototype._onMessage = function(e) {
    if (e.data.log) {
        console.log.apply(console, e.data.args);
        return;
    }
    if (this.currentWorkerWork && this.currentWorkerWork.id === e.data.id) {
        var currentWork = this.currentWorkerWork;
        this.currentWorkerWork = null;
        if (e.data.transferList && e.data.transferList.length) {
            this.emit("transferList", e.data.transferList);
        }
        if (e.data.error) {
            currentWork.reject(e.data.error);
        } else {
            currentWork.resolve(e.data.result);
        }
        this._workerNext();
    }
};

PoolWorker.prototype._workerNext = function() {
    if (!this.workerQueue.length) {
        this.workerVacant = true;
        this.currentWorkerWork = null;
    } else {
        this._startWork(this.workerQueue.shift());
    }
};

PoolWorker.prototype._mainNext = function() {
    if (!this.mainQueue.length) {
        this.mainVacant = true;
        this.currentMainWork = null;
    } else {
        this._startWork(this.mainQueue.shift());
    }
};

PoolWorker.prototype._startWork = function(work) {
    if (work.descriptor.type === WORKER_THREAD) {
        var transferList = work.descriptor.transferList;
        var message = {
            id: work.id,
            args: work.descriptor.args,
            methodName: work.descriptor.methodName,
            transferList: null
        };
        if (transferList && transferList.length) {
            message.transferList = transferList;
            this.worker.postMessage(message, transferList);
        } else {
            this.worker.postMessage(message);
        }
        this.workerVacant = false;
        this.currentWorkerWork = work;
    } else if (work.descriptor.type === MAIN_THREAD) {
        var self = this;
        work.resolve(new Promise(function(resolve) {
            resolve(work.descriptor.fn());
        }).finally(function() {
            self._mainNext();
        }));
        this.mainVacant = false;
        this.currentMainWork = work;
    }
};

PoolWorker.prototype.isVacantForWorkerWork = function() {
    return this.workerVacant;
};

PoolWorker.prototype.isVacantForMainWork = function() {
    return this.mainVacant;
};

PoolWorker.prototype.queueWork = function(descriptor) {
    var workId = runningId++;
    var self = this;
    return new Promise(function(resolve, reject) {
        var work = {
            id: workId,
            resolve: resolve,
            reject: reject,
            descriptor: descriptor
        };

        if (descriptor.type === MAIN_THREAD) {
            if (!self.mainVacant) {
                self.mainQueue.push(work);
            } else {
                self._startWork(work);
                self.mainVacant = false;
            }
        } else if (descriptor.type === WORKER_THREAD) {
            if (!self.workerVacant) {
                self.workerQueue.push(work);
            } else {
                self._startWork(work);
                self.workerVacant = false;
            }
        }
    });
};

PoolWorker.prototype.invokeInMainThread = function(fn) {
    var descriptor = {
        type: MAIN_THREAD,
        fn: fn
    };

    return this.queueWork(descriptor);
};

PoolWorker.prototype.invokeInWorkerThread = function(methodName, args, transferList) {
    var descriptor = {
        type: WORKER_THREAD,
        methodName: methodName,
        args: args || [],
        transferList: transferList || []
    };

    return this.queueWork(descriptor);
};

function WorkerPool(count, url) {
    EventEmitter.call(this);
    count = Math.max(1, +count) || 1;
    this.url = url;
    this.lastWorkerWorkQueued = -1;
    this.lastWorkerMainQueued = -1;
    this.poolWorkers = new Array(count);
    this.reservedWorkers = [];

    for (var i = 0; i < count; ++i) {
        this.poolWorkers[i] = new PoolWorker(this, url);
    }
}
util.inherits(WorkerPool, EventEmitter);

WorkerPool.prototype.reserveWorker = function() {
    var worker = this.poolWorkers.shift();
    if (worker) {
        this.reservedWorkers.push(worker);
    }
    return worker || null;
};

WorkerPool.prototype.restoreWorker = function(worker) {
    var i = this.reservedWorkers.indexOf(worker);
    if (i >= 0) {
        this.reservedWorkers.splice(i, 1);
        this.poolWorkers.push(worker);
    }
};

WorkerPool.prototype._getNextPoolWorkerForWorkerWork = function() {
    for (var i = 0; i < this.poolworkers.length; ++i) {
        if (this.poolWorkers[i].isVacantForWorkerWork()) {
            return this.poolWorkers[i];
        }
    }
    var index = (this.lastWorkerWorkQueued  + 1) % this.poolworkers.length;
    this.lastWorkerWorkQueued = index;
    return this.poolWorkers[index];
};

WorkerPool.prototype._getNextPoolWorkerForMainWork = function() {
    for (var i = 0; i < this.poolworkers.length; ++i) {
        if (this.poolWorkers[i].isVacantForMainWork()) {
            return this.poolWorkers[i];
        }
    }
    var index = (this.lastWorkerMainQueued + 1) % this.poolworkers.length;
    this.lastWorkerMainQueued = index;
    return this.poolWorkers[index];
};

WorkerPool.prototype.invokeInMainThread = function(fn) {
    var descriptor = {
        type: MAIN_THREAD,
        fn: fn
    };

    return this._getNextPoolWorkerForMainWork().queueWork(descriptor);
};

WorkerPool.prototype.invokeInWorkerThread = function(methodName, args, transferList) {
    var descriptor = {
        type: WORKER_THREAD,
        methodName: methodName,
        args: args,
        transferList: transferList || []
    };

    return this._getNextPoolWorkerForWorkerWork().queueWork(descriptor);
};

module.exports = WorkerPool;
