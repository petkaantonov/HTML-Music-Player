"use strict";

const globalObject = typeof self !== "undefined" ? self : global;
const codecs = Object.create(null);

var expectedCodec = null;
const loadCodec = function(name, retries) {
    if (codecs[name]) return codecs[name];
    if (retries === undefined) retries = 0;
    codecs[name] = new Promise(function(resolve, reject) {
        var url = "codecs/" + name + ".js";
        var xhr = new XMLHttpRequest();
        xhr.addEventListener("load", function() {
            if (xhr.status >= 300) {
                if (xhr.status >= 500 && retries < 5) {
                    return resolve(Promise.delay(1000).then(function() {
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
                    resolve(expectedCodec.exports);
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
};

globalObject.codecLoaded = function(name, exports) {
    expectedCodec = {
        name: name,
        exports: exports
    };
};

var codec = {};

codec.getCodec = function(name) {
    return loadCodec(name);
};

module.exports = codec;
