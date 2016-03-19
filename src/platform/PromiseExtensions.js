/* globals self: false */
"use strict";

import { subClassError } from "util";

const PromiseCatch = self.Promise.prototype.catch;
var NativePromise = self.Promise;

const matches = function(filter, error) {
    if (typeof filter === "function") {
        if (filter.prototype instanceof Error || filter === Error) {
            return error instanceof filter;
        } else {
            return filter(error);
        }
    } else if (typeof filter === "object" && filter !== null) {
        var keys = Object.keys(filter);
        for (var i = 0; i < keys.length; ++i) {
            if (error[keys[i]] !== filter[keys[i]]) {
                return false;
            }
        }
        return true;
    }
};

NativePromise.prototype.finally = function(fn) {
    return this.then(function(value) {
        return Promise.resolve(fn()).then(function() {
            return value;
        });
    }, function(reason) {
        return Promise.resolve(fn()).then(function() {
            throw reason;
        });
    });
};

NativePromise.prototype.tap = function(fn) {
    return this.then(function(result) {
        return Promise.resolve(fn).then(function() {
            return result;
        });
    });
};

NativePromise.prototype.return = function(val) {
    return this.then(function() {
        return val;
    });
};

NativePromise.prototype.thenReturn = NativePromise.prototype.return;

NativePromise.prototype.catch = function() {
    if (arguments.length <= 1) return PromiseCatch.apply(this, arguments);
    var filters = new Array(arguments.length - 1);
    for (var i = 0; i < filters.length; ++i) {
        filters[i] = arguments[i];
    }
    var handler = arguments[arguments.length - 1];
    return PromiseCatch.call(this, function(e) {
        for (var i = 0; i < filters.length; ++i) {
            var filter = filters[i];
            if (matches(filter, e)) {
                return handler.call(this, e);
            }
        }
        throw e;
    });
};

NativePromise.method = function(fn) {
    return function() {
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i) {
            args[i] = arguments[i];
        }
        var self = this;
        return new NativePromise(function(resolve) {
            resolve(fn.apply(self, args));
        });
    };
};

NativePromise.try = function(fn) {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; ++i) {
        args[i] = arguments[i];
    }
    var self = this;
    return new NativePromise(function(resolve) {
        resolve(fn.apply(self, args));
    });
};

NativePromise.delay = function(ms) {
    return new NativePromise(function(resolve) {
        self.setTimeout(resolve, ms);
    });
};

NativePromise.join = function() {
    var args = new Array(arguments.length - 1);
    for (var i = 0; i < args.length; ++i) {
        args[i] = arguments[i];
    }
    var fn = arguments[arguments.length - 1];
    return NativePromise.all(args).then(function(args) {
        return fn.apply(null, args);
    });
};

NativePromise.TimeoutError = subClassError("TimeoutError");

export default NativePromise;
