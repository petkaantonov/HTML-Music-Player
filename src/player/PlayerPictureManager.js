import jdenticon from "jdenticon";
import {noUndefinedGet, hexString} from "util";
import {canvasToImage} from "platform/dom/util";
import EventEmitter from "events";
import {ALBUM_ART_PREFERENCE_SMALLEST as preference} from "metadata/MetadataManagerBackend";
import {TAG_DATA_UPDATE_EVENT} from "metadata/MetadataManagerFrontend";
import {Image, URL} from "platform/platform";
import {TRACK_PLAYING_STATUS_CHANGE_EVENT} from "player/PlaylistController";

export const IMAGE_CHANGE_EVENT = `imageChange`;

const requestReason = `PlayerPictureManager`;

const isSameImage = function(a, b) {
    return a.src === b.src;
};

export default class PlayerPictureManager extends EventEmitter {
    constructor(opts, deps) {
        super();
        opts = noUndefinedGet(opts);
        this._page = deps.page;
        this._player = deps.player;
        this._playlist = deps.playlist;
        this._metadataManager = deps.metadataManager;
        this._applicationPreferencesBindingContext = deps.applicationPreferencesBindingContext;
        this._domNode = this._page.$(opts.target);

        this._imageDimensions = opts.imageDimensions;
        this._defaultImageSrc = opts.defaultImageSrc;

        this._enabled = true;
        this._currentImage = this.$().find(`img`)[0] || null;
        this._currentTrack = null;

        this.imageErrored = this.imageErrored.bind(this);
        this.imageLoaded = this.imageLoaded.bind(this);
        this._trackTagDataUpdated = this._trackTagDataUpdated.bind(this);
        this._onAlbumArt = this._onAlbumArt.bind(this);

        this._metadataManager.on(`albumArt`, this._onAlbumArt);
        this._playlist.on(TRACK_PLAYING_STATUS_CHANGE_EVENT, (playlistTrack) => {
            this._trackChanged(playlistTrack.track());
        });
        this._generatedImages = new Map();

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

    getCurrentImage() {
        return this._currentImage || this.defaultImage();
    }

    defaultImage() {
        return this._defaultImage;
    }

    async imageErrored(e) {
        if (e.target === this._currentImage) {
            e.target.albumArtTrackUid = null;
            const track = this._currentTrack;
            if (track) {
                const image = await this.generateImageForTrack(this._currentTrack);
                if (this._currentTrack === track) {
                    this.updateImage(image);
                }
            }
        }
    }

    imageLoaded(e) {
        if (e.target === this._currentImage) {
            this.emit(IMAGE_CHANGE_EVENT, e.target);
        }
    }

    updateImage(image) {
        if (!image) return;

        if (this._currentImage && isSameImage(this._currentImage, image)) {
            return;
        }

        if (this._currentImage) {
            this._page.$(this._currentImage).removeEventListener(`error`, this.imageErrored).
                                            removeEventListener(`load`, this.imageLoaded).
                                            remove();
            this._currentImage = null;
        }

        this._currentImage = image;
        this.$().append(this._currentImage);

        if (!this._currentImage.isGenerated) {
            this._page.$(this._currentImage).addEventListener(`error`, this.imageErrored);
            this._page.$(this._currentImage).addEventListener(`load`, this.imageLoaded);

            if (this._currentImage.complete) {
                this.emit(IMAGE_CHANGE_EVENT, this._currentImage);
            }
        } else {
            this.emit(IMAGE_CHANGE_EVENT, this._currentImage);
        }
    }

    _onAlbumArt(track, albumArt, reason) {
        if (!this._isEnabled()) return;

        if (requestReason === reason) {
            if (this._currentImage && this._currentImage.src === albumArt) {
                return;
            }

            if (!this._currentTrack) {
                return;
            }
            const equalsCurrent = this._currentTrack.uidEquals(track.uid());

            if (!equalsCurrent) {
                return;
            }

            const image = new Image();
            image.src = albumArt;

            image.albumArtTrackUid = track.uid();

            this.updateImage(image);
        }
    }

    _fetchCurrentTrackAlbumArt() {
        if (!this._isEnabled() || !this._currentTrack) return;
        const track = this._currentTrack;
        if (this.isCurrentImageAlbumArtForCurrentTrack()) {
            return;
        }

        const {_album: album, _artist: artist} = track;
        this._metadataManager.getAlbumArt(track, {
            album, artist, preference, requestReason
        });
    }

    _trackTagDataUpdated() {
        this._fetchCurrentTrackAlbumArt();
    }

    _isEnabled() {
        return this._enabled;
    }

    _preferenceChanged(enabled) {
        this._enabled = enabled;
        this._fetchCurrentTrackAlbumArt();
        // TODO: Change dom dimensions and hide element
    }

    async _trackChanged(track) {
        if (track === this._currentTrack) {
            return;
        }

        if (this._currentTrack) {
            this._currentTrack.removeListener(TAG_DATA_UPDATE_EVENT, this._trackTagDataUpdated);
            this._currentTrack = null;
        }
        if (track) {
            this._currentTrack = track;
            this._fetchCurrentTrackAlbumArt();
            this._currentTrack.on(TAG_DATA_UPDATE_EVENT, this._trackTagDataUpdated);
            const generatedImage = await this.generateImageForTrack(track);
            if (track === this._currentTrack) {
                if (this.isCurrentImageAlbumArtForCurrentTrack()) {
                    return;
                }
                this.updateImage(generatedImage);
            }
        }
    }

    isCurrentImageAlbumArtForCurrentTrack() {
        if (this._currentImage && this._currentTrack) {
            if (!this._currentImage.albumArtTrackUid) {
                return false;
            }
            return this._currentTrack.uidEquals(this._currentImage.albumArtTrackUid);
        } else {
            return false;
        }
    }

    async generateImageForTrack(track) {
        const uid = track.uid();
        const size = this.size();

        const key = `${hexString(uid)}-${size}`;

        const ret = this._generatedImages.get(key);

        if (ret) {
            return ret;
        }

        // TODO: Based on byte size
        if (this._generatedImages.size > 50) {
            const keys = this._generatedImages.keys();
            let j = 0;
            for (const cachedKey of keys) {
                if (j > 25) {
                    break;
                }
                const image = this._generatedImages.get(cachedKey);
                if (this._currentImage && this._currentImage.src === image.src) {
                    continue;
                }

                try {
                    URL.revokeObjectURL(image.src);
                } catch (e) {
                    // NOOP
                }
                image.blob = null;
                this._generatedImages.delete(cachedKey);
                j++;
            }
        }

        const ctx = this._jdenticonCtx;
        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, 255)`;
        ctx.fillRect(0, 0, size, size);
        ctx.restore();
        jdenticon.drawIcon(ctx, hexString(uid), size);
        const image = await canvasToImage(this._jdenticonCanvas, this._page);
        this._generatedImages.set(key, image);
        return image;
    }

}
