"use strict";
import $ from "jquery";
import jdenticon from "jdenticon";
import Promise from "bluebird";
import { addLegacyListener } from "lib/util";
import { canvasToImage } from "lib/DomUtil";

const IMAGE_DIMENSIONS = 97;
export default function PlayerPictureManager(dom, player, opts) {
    opts = Object(opts);
    this._domNode = $(dom);
    this.player = player;
    player.setPictureManager(this);
    this.favicon = $(null);

    this._enabledMediaMatcher = opts.enabledMediaMatcher || null;
    this._enabled = true;
    this._currentImage = null;

    this._enabledMediaMatchChanged = this._enabledMediaMatchChanged.bind(this);
    this.newTrackLoaded = this.newTrackLoaded.bind(this);
    this.player.on("newTrackLoad", this.newTrackLoaded);

    if (this._enabledMediaMatcher) {
        addLegacyListener(this._enabledMediaMatcher, "change", this._enabledMediaMatchChanged);
        this._enabledMediaMatchChanged();
    }
}

PlayerPictureManager.prototype.$ = function() {
    return this._domNode;
};

PlayerPictureManager.prototype._enabledMediaMatchChanged = function() {
    var wasEnabled = !!this._enabled;
    this._enabled = !!this._enabledMediaMatcher.matches;
    if (this._enabled && !wasEnabled) {
        if (this._currentImage) {
            $(this._currentImage).appendTo(this.$());
        }
    } else if (!this._enabled && wasEnabled) {
        if (this._currentImage) {
            $(this._currentImage).detach();
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

PlayerPictureManager.prototype.updateImage = function(image) {
    if (!image) return;

    if (this._currentImage && isSameImage(this._currentImage, image)) {
        return;
    }

    this.$().find("img").off("load error").remove();
    this._currentImage = image;

    if (this._enabled) {
        $(this._currentImage).appendTo(this.$());
    }

    if (!image.complete) {
        $(this._currentImage).one("error", function() {
            $(this).off("load error").addClass("erroneous-image");
        }).one("load", function() {
            $(this).off("load error");
        });
    }
};

PlayerPictureManager.prototype.updateImageFromTrack = function(track) {
    track.getImage().bind(this).then(this.updateImage);
};

PlayerPictureManager.prototype.newTrackLoaded = function() {
    this.player.getImage().bind(this).then(this.updateImage);
};

const jdenticonCanvas = document.createElement("canvas");
const jdenticonSize = (IMAGE_DIMENSIONS * (self.devicePixelRatio || 1))|0;
jdenticonCanvas.width = jdenticonCanvas.height = jdenticonSize;
const jdenticonContext = jdenticonCanvas.getContext("2d");

PlayerPictureManager.generateImageForTrack = Promise.method(function(track) {
    // Chrome has weird bugs with notifications when image has alpha.
    var clearRect = jdenticonContext.clearRect;
    // Prevent clearRect which would reset alpha channel.
    jdenticonContext.clearRect = function() {};
    clearRect.call(jdenticonContext, 0, 0, jdenticonSize, jdenticonSize);
    jdenticonContext.save();
    jdenticonContext.fillStyle = "rgba(255, 255, 255, 255)";
    jdenticonContext.fillRect(0, 0, jdenticonSize, jdenticonSize);
    jdenticonContext.restore();
    jdenticon.drawIcon(jdenticonContext, track.uid(), jdenticonSize);
    jdenticonContext.clearRect = clearRect;
    return canvasToImage(jdenticonCanvas);
});

const defaultImage = new Image();
defaultImage.src = "/dist/images/apple-touch-icon-180x180.png";
PlayerPictureManager.getDefaultImage = function() {
    return defaultImage;
};
