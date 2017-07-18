import jdenticon from "jdenticon";
import {noUndefinedGet, hexString} from "util";
import {canvasToImage} from "platform/dom/util";
import CancellableOperations from "utils/CancellationToken";

const isSameImage = function(a, b) {
    if (a.tag !== undefined && b.tag !== undefined) {
        return a.tag === b.tag;
    } else {
        return false;
    }
}

export default class PlayerPictureManager extends CancellableOperations(null, `imageUpdateOperation`) {
    constructor(opts, deps) {
        super();
        opts = noUndefinedGet(opts);
        this._page = deps.page;
        this._player = deps.player;
        this._player.setPictureManager(this);
        this._playlist = deps.playlist;
        this._applicationPreferencesBindingContext = deps.applicationPreferencesBindingContext;
        this._domNode = this._page.$(opts.target);

        this._imageDimensions = opts.imageDimensions;
        this._defaultImageSrc = opts.defaultImageSrc;

        this._enabled = true;
        this._currentImage = this.$().find(`img`)[0] || null;
        this._currentTrack = null;

        this.imageErrored = this.imageErrored.bind(this);
        this._trackTagDataUpdated = this._trackTagDataUpdated.bind(this);

        this._playlist.on(`trackPlayingStatusChange`, this._trackChanged.bind(this));

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

        const preferenceChangeHandler = () => {
            this._preferenceChanged(this._applicationPreferencesBindingContext.getPreference(`enableAlbumArt`));
        };
        this._applicationPreferencesBindingContext.on(`change`, preferenceChangeHandler);
    }

    size() {
        return (this._imageDimensions * this._page.devicePixelRatio()) | 0;
    }

    $() {
        return this._domNode;
    }

    defaultImage() {
        return this._defaultImage;
    }

    imageErrored() {
        this.cancelAllImageUpdateOperations();
        const cancellationToken = this.cancellationTokenForImageUpdateOperation();
        this.applyCurrentTrackImage(cancellationToken);
    }

    updateImage(image) {
        if (!image) return;

        if (this._currentImage && isSameImage(this._currentImage, image)) {
            return;
        }

        if (this._currentImage) {
            this._page.$(this._currentImage).removeEventListener(`error`, this.imageErrored).remove();
            this._currentImage = null;
        }

        this._currentImage = image;
        this.$().append(this._currentImage);
        this._page.$(this._currentImage).addEventListener(`error`, this.imageErrored);
    }


    async applyCurrentTrackImage(cancellationToken) {
        if (!this._currentTrack || !this._isEnabled()) {
            return;
        }
        const image = await this._currentTrack.getImage(this);
        if (!cancellationToken.isCancelled()) {
            this.updateImage(image, cancellationToken);
        }
    }

    _trackTagDataUpdated() {
        this.cancelAllImageUpdateOperations();
        const cancellationToken = this.cancellationTokenForImageUpdateOperation();
        this.applyCurrentTrackImage(cancellationToken);
    }

    _isEnabled() {
        return this._enabled;
    }

    _preferenceChanged(enabled) {
        this._enabled = enabled;
        this.cancelAllImageUpdateOperations();
        const cancellationToken = this.cancellationTokenForImageUpdateOperation();
        // TODO: Change dom dimensions
        this.applyCurrentTrackImage(cancellationToken);
    }

    _trackChanged(track) {
        if (track === this._currentTrack) {
            return;
        }

        const cancellationToken = this.cancellationTokenForImageUpdateOperation();
        if (this._currentTrack) {
            this._currentTrack.removeListener(`tagDataUpdate`, this._trackTagDataUpdated);
            this._currentTrack = null;
        }
        if (track) {
            this._currentTrack = track;
            this._currentTrack.on(`tagDataUpdate`, this._trackTagDataUpdated);
            this.applyCurrentTrackImage(cancellationToken);
        }
    }

    async generateImageForTrack(track) {
        const size = this.size();
        const ctx = this._jdenticonCtx;
        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, 255)`;
        ctx.fillRect(0, 0, size, size);
        ctx.restore();
        const uid = await track.uid();
        jdenticon.drawIcon(ctx, hexString(uid), size);
        return canvasToImage(this._jdenticonCanvas, this._page);
    }

}
