"use strict";

import jdenticon from "jdenticon";
import { addLegacyListener } from "util";
import { canvasToImage } from "platform/dom/util";

export default function PlayerPictureManager(opts, deps) {
    opts = Object(opts);
    this._page = deps.page;
    this._player = deps.player;
    this._player.setPictureManager(this);
    this._domNode = this._page.$(opts.target);

    this._imageDimensions = opts.imageDimensions;
    this._defaultImageSrc = opts.defaultImageSrc;
    this._enabledMediaMatcher = opts.enabledMediaMatcher || null;
    this._enabled = true;
    this._currentImage = null;
    this._nextImageRequestId = -1;

    this._enabledMediaMatchChanged = this._enabledMediaMatchChanged.bind(this);

    this.imageErrored = this.imageErrored.bind(this);
    this.imageLoaded = this.imageLoaded.bind(this);
    this.newTrackLoaded = this.newTrackLoaded.bind(this);
    this.updateImage = this.updateImage.bind(this);

    this._player.on("newTrackLoad", this.newTrackLoaded);

    if (this._enabledMediaMatcher) {
        addLegacyListener(this._enabledMediaMatcher, "change", this._enabledMediaMatchChanged);
        this._enabledMediaMatchChanged();
    }

    var size = this.size();
    var canvas = this._page.createElement("canvas", {
        width: size,
        height: size
    })[0];

    this._defaultImage = this._page.createElement("img", {
        width: this._imageDimensions,
        height: this._imageDimensions,
        src: this._defaultImageSrc
    })[0];

    this._jdenticonCanvas = canvas;
    this._jdenticonCtx = canvas.getContext("2d");
    deps.ensure();
}

PlayerPictureManager.prototype.size = function() {
    return (this._imageDimensions * this._page.devicePixelRatio())|0;
};

PlayerPictureManager.prototype.$ = function() {
    return this._domNode;
};

PlayerPictureManager.prototype.defaultImage = function() {
    return this._defaultImage;
};

PlayerPictureManager.prototype._enabledMediaMatchChanged = function() {
    var wasEnabled = !!this._enabled;
    this._enabled = !!this._enabledMediaMatcher.matches;
    if (this._enabled && !wasEnabled) {
        if (this._currentImage) {
            this.$().append(this._currentImage);
        }
    } else if (!this._enabled && wasEnabled) {
        if (this._currentImage) {
            this._page.$(this._currentImage).detach();
        }
    }
};

const isSameImage = function(a, b) {
    if (a.tag !== undefined && b.tag !== undefined) {
        return a.tag === b.tag;
    } else {
        return false;
    }
};

PlayerPictureManager.prototype.imageErrored = function(e) {
    e.target.removeEventListener("load", this.imageLoaded);
    e.target.removeEventListener("error", this.imageErrored);
    e.target.classList.add("erroneous-image");
};

PlayerPictureManager.prototype.imageLoaded = function(e) {
    e.target.removeEventListener("load", this.imageLoaded);
    e.target.removeEventListener("error", this.imageErrored);
};

PlayerPictureManager.prototype.updateImage = function(image) {
    if (!image) return;

    if (this._currentImage && isSameImage(this._currentImage, image)) {
        return;
    }

    this.$().find("img")
        .removeEventListener("load", this.imageLoaded)
        .removeEventListener("error", this.imageErrored)
        .remove();

    this._currentImage = image;

    if (this._enabled) {
        this.$().append(this._currentImage);
    }

    if (!image.complete) {
        this._page.$(image)
            .addEventListener("error", this.imageErrored)
            .addEventListener("load", this.imageLoaded);
    }
};

PlayerPictureManager.prototype.receiveImage = function(imagePromise) {
    var self = this;
    var id = ++this._nextImageRequestId;
    imagePromise.then(function(image) {
        if (self._nextImageRequestId === id) {
            self.updateImage(image);
        }
    });
};

PlayerPictureManager.prototype.updateImageFromTrack = function(track) {
    this.receiveImage(track.getImage(this));
};

PlayerPictureManager.prototype.newTrackLoaded = function() {
    this.receiveImage(this._player.getImage(this));
};

PlayerPictureManager.prototype.generateImageForTrack = Promise.method(function(track) {
    var size = this.size();
    var ctx = this._jdenticonCtx;
    // Chrome has weird bugs with notifications when image has alpha.
    var clearRect = ctx.clearRect;
    // Prevent clearRect calls from jdenticon which would reset alpha channel.
    ctx.clearRect = function() {};
    clearRect.call(ctx, 0, 0, size, size);
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 255)";
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
    jdenticon.drawIcon(ctx, track.uid(), size);
    ctx.clearRect = clearRect;
    return canvasToImage(this._jdenticonCanvas, this._page);
});
