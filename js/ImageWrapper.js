const ImageWrapper = (function() {

const EMPTY = {};

function ImageWrapper(url) {
    var self = this;
    this.url = url;
    this.img = null;
    this.elementPromise = new Promise(function(resolve, reject) {
        var img = $('<img>', {src: self.url})
                        .on("error", function() {
                            reject(new Error("invalid image"));
                        })
                        .on("load", function() {
                            resolve(img[0]);
                        });
        self.img = img;
        if (img.complete) {
            resolve(img[0]);
        }
    }).catch(function(e) {
        self.destroy();
        throw e;
    }).finally(function() {
        $(self.img).off("error load");
    });
    this.elementPromise.catch(function(){});
}

ImageWrapper.prototype.destroy = function() {
    if (this.url) {
        URL.revokeObjectURL(this.url);
        this.url = this.img = null;
    }
};

ImageWrapper.prototype.getElementAsync = function() {
    return this.elementPromise;
};

ImageWrapper.prototype.getUrl = function() {
    return this.url;
};

ImageWrapper.EMPTY = new ImageWrapper("/dist/images/icon.png");

return ImageWrapper; })();
