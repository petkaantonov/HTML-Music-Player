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


}

module.exports = patch;
