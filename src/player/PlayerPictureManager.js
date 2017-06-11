import jdenticon from "jdenticon";
import {addLegacyListener, noUndefinedGet} from "util";
import {canvasToImage} from "platform/dom/util";

export default function PlayerPictureManager(opts, deps) {
    opts = noUndefinedGet(opts);
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

    this._player.on(`newTrackLoad`, this.newTrackLoaded);

    if (this._enabledMediaMatcher) {
        addLegacyListener(this._enabledMediaMatcher, `change`, this._enabledMediaMatchChanged);
        this._enabledMediaMatchChanged();
    }

    const size = this.size();
    const canvas = this._page.createElement(`canvas`, {
        width: size,
        height: size
    })[0];

    this._defaultImage = this._page.createElement(`img`, {
        width: this._imageDimensions,
        height: this._imageDimensions,
        src: this._defaultImageSrc
    })[0];

    this._jdenticonCanvas = canvas;
    this._jdenticonCtx = canvas.getContext(`2d`);

}

PlayerPictureManager.prototype.size = function() {
    return (this._imageDimensions * this._page.devicePixelRatio()) | 0;
};

PlayerPictureManager.prototype.$ = function() {
    return this._domNode;
};

PlayerPictureManager.prototype.defaultImage = function() {
    return this._defaultImage;
};

PlayerPictureManager.prototype._enabledMediaMatchChanged = function() {
    const wasEnabled = !!this._enabled;
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
    e.target.removeEventListener(`load`, this.imageLoaded);
    e.target.removeEventListener(`error`, this.imageErrored);
    e.target.classList.add(`erroneous-image`);
};

PlayerPictureManager.prototype.imageLoaded = function(e) {
    e.target.removeEventListener(`load`, this.imageLoaded);
    e.target.removeEventListener(`error`, this.imageErrored);
};

PlayerPictureManager.prototype.updateImage = function(image) {
    if (!image) return;

    if (this._currentImage && isSameImage(this._currentImage, image)) {
        return;
    }

    this.$().find(`img`).
        removeEventListener(`load`, this.imageLoaded).
        removeEventListener(`error`, this.imageErrored).
        remove();

    this._currentImage = image;

    if (this._enabled) {
        this.$().append(this._currentImage);
    }

    if (!image.complete) {
        this._page.$(image).
            addEventListener(`error`, this.imageErrored).
            addEventListener(`load`, this.imageLoaded);
    }
};

PlayerPictureManager.prototype.receiveImage = async function(imagePromise) {
    const id = ++this._nextImageRequestId;
    const image = await imagePromise;
    if (this._nextImageRequestId === id) {
        this.updateImage(image);
    }
};

PlayerPictureManager.prototype.updateImageFromTrack = async function(track) {
    await this.receiveImage(track.getImage(this));
};

PlayerPictureManager.prototype.newTrackLoaded = async function() {
    await this.receiveImage(this._player.getImage(this));
};

PlayerPictureManager.prototype.generateImageForTrack = async function(track) {
    const size = this.size();
    const ctx = this._jdenticonCtx;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, 255)`;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
    const uid = await track.uid();
    jdenticon.drawIcon(ctx, uid, size);
    return canvasToImage(this._jdenticonCanvas, this._page);
};
