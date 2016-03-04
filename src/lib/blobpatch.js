"use strict";

function titleCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function prefix(Class, methodName) {
    var MethodName = titleCase(methodName);
    return Class.prototype[methodName] ||
           Class.prototype["ms" + MethodName] ||
           Class.prototype["moz" + MethodName] ||
           Class.prototype["webkit" + MethodName];
}

function patch() {
    if (typeof Blob !== "undefined") {
        const BlobClose = prefix(Blob, "close");
        if (typeof BlobClose === "undefined") {
            Blob.prototype.close = function() {};
        } else {
            Blob.prototype.close = function() {
                try {
                    return BlobClose.apply(this, arguments);
                } catch (e) {}
            };
        }

        if (typeof Blob.prototype.slice !== "function") {
            Blob.prototype.slice = prefix(Blob, "slice");
        }
    }

    if (typeof File !== "undefined") {
        const FileClose = prefix(File, "close");
        if (typeof FileClose === "undefined") {
            File.prototype.close = function() {};
        } else if (FileClose !== Blob.prototype.close) {
            FileClose.prototype.close = function() {
                try {
                    return FileClose.apply(this, arguments);
                } catch (e) {}
            };
        }

        if (typeof File.prototype.slice !== "function") {
            File.prototype.slice = prefix(File, "slice");
        }
    }

    if (typeof ArrayBuffer.transfer !== "function") {
        var insideWorker = typeof self !== "undefined" && typeof self.postMessage === "function";
        var worker;

        if (!insideWorker) {
            var src = "self.addEventListener('message', function(){}, false);";
            var blob = new Blob([src], {type: "application/javascript"});
            worker = new Worker(URL.createObjectURL(blob));
        }

        const arr = new Array(1);
        ArrayBuffer.transfer = function(buffer, newByteLength) {
            if (newByteLength !== 0) {
                throw new Error("newByteLength must be 0");
            }
            var blackHole = worker ? worker : self;
            arr[0] = buffer;
            blackHole.postMessage(buffer, arr);
            return buffer;
        };
    }
}

module.exports = patch;
