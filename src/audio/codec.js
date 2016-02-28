"use strict";

const globalObject = typeof self !== "undefined" ? self : global;
const codecs = Object.create(null);

const delay = function(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
};

var expectedCodec = null;
const loadCodec = function(name, retries) {
    if (codecs[name]) return codecs[name];
    if (retries === undefined) retries = 0;
    codecs[name] = new Promise(function(resolve, reject) {
        var url = globalObject.DEBUGGING === false ? "codecs/" + name + ".min.js" : "codecs/" + name + ".js";
        var xhr = new XMLHttpRequest();
        xhr.addEventListener("load", function() {
            if (xhr.status >= 300) {
                if (xhr.status >= 500 && retries < 5) {
                    return resolve(delay(1000).then(function() {
                        return loadCodec(name, retries + 1);
                    }));
                }
                return reject(new Error("http error when loading codec: " + xhr.status + " " + xhr.statusText))
            } else {
                var code = xhr.responseText;
                expectedCodec = null;
                try {
                    new Function(code)();
                    if (!expectedCodec || expectedCodec.name !== name) {
                        reject(new Error("codec " + name + " did not register properly"));
                    }
                    resolve(expectedCodec);
                } finally {
                    expectedCodec = null;
                }
            }
        }, false);

        xhr.addEventListener("error", function() {
            reject(new Error("error when loading codec"));
        }, false);

        xhr.open("GET", url);
        xhr.send(null);
    });
    return codecs[name];
};

globalObject.codecLoaded = function(name, Context) {
    expectedCodec = {
        name: name,
        Context: Context
    };
};

var codec = {};

codec.getCodec = function(name) {
    return loadCodec(name);
};

module.exports = codec;
