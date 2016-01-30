"use strict";
function patch() {
    if (typeof Blob !== "undefined") {
        const BlobClose = Blob.prototype.close;
        if (typeof BlobClose === "undefined") {
            Blob.prototype.close = function() {};
        } else {
            Blob.prototype.close = function() {
                try {
                    return BlobClose.apply(this, arguments);
                } catch (e) {}
            };
        }
    }

    if (typeof File !== "undefined") {
        const FileClose = File.prototype.close;
        if (typeof FileClose === "undefined") {
            File.prototype.close = function() {};
        } else if (FileClose !== Blob.prototype.close) {
            FileClose.prototype.close = function() {
                try {
                    return FileClose.apply(this, arguments);
                } catch (e) {}
            };
        }
    }
}

module.exports = patch;
