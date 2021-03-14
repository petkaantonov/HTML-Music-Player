import { SelectDeps } from "Application";
//@ts-ignore
import EventEmitter from "eventsjs";
import jdenticon from "jdenticon";
import MetadataManagerFrontend, {
    ALBUM_ART_PREFERENCE_SMALLEST as preference,
    Track,
} from "metadata/MetadataManagerFrontend";
import Page, { DomWrapper, DomWrapperSelector } from "platform/dom/Page";
import { canvasToImage } from "platform/dom/util";
import { EventEmitterInterface } from "types/helpers";
import ApplicationPreferencesBindingContext from "ui/ApplicationPreferencesBindingContext";

import { hexString } from "../util";
import PlaylistController from "./PlaylistController";

export const IMAGE_CHANGE_EVENT = `imageChange`;
const IMAGE_DIMENSIONS = 90;

const requestReason = `PlayerPictureManager`;

const isSameImage = function (a: ExpandoImage, b: ExpandoImage) {
    return a.src === b.src;
};

type Deps = SelectDeps<"page" | "playlist" | "metadataManager" | "applicationPreferencesBindingContext">;

interface Opts {
    target: DomWrapperSelector;
    defaultImageSrc: string;
}
interface ImageExpandoProperties {
    albumArtTrackUid?: ArrayBuffer;
    isGenerated?: boolean;
    blob?: Blob;
}
export interface ExpandoImage extends HTMLImageElement, ImageExpandoProperties {}

interface PlayerPictureManagerEventsMap {
    imageChanged: (image: ExpandoImage) => void;
}
export default interface PlayerPictureManager extends EventEmitterInterface<PlayerPictureManagerEventsMap> {}

export default class PlayerPictureManager extends EventEmitter {
    private _page: Page;
    private _playlist: PlaylistController;
    private _metadataManager: MetadataManagerFrontend;
    private _applicationPreferencesBindingContext: ApplicationPreferencesBindingContext;
    private _domNode: DomWrapper;
    private _defaultImageSrc: string;
    private _enabled: boolean;
    private _currentImage: ExpandoImage | null;
    private _currentTrack: null | Track;
    private _generatedImages: Map<string, ExpandoImage>;
    private _defaultImage: ExpandoImage;
    private _jdenticonCanvas: HTMLCanvasElement;
    private _jdenticonCtx: CanvasRenderingContext2D;

    constructor(opts: Opts, deps: Deps) {
        super();
        this._page = deps.page;
        this._playlist = deps.playlist;
        this._metadataManager = deps.metadataManager;
        this._applicationPreferencesBindingContext = deps.applicationPreferencesBindingContext;
        this._domNode = this._page.$(opts.target);

        this._defaultImageSrc = opts.defaultImageSrc;

        this._enabled = true;
        this._currentImage = (this.$().find(`img`)[0] || null) as HTMLImageElement | null;
        this._currentTrack = null;

        this._metadataManager.on("albumArtReceived", (track, albumArt, requestReason) => {
            this._onAlbumArt(track, albumArt, requestReason);
        });
        this._playlist.on("playlistTrackPlayingStatusChanged", playlistTrack => {
            const track = playlistTrack.track();
            if (track) {
                void this._trackChanged(track);
            }
        });
        this._generatedImages = new Map();

        const size = this.size().toString();
        const canvas = this._page.createElement(`canvas`, {
            width: size,
            height: size,
        })[0]! as HTMLCanvasElement;

        this._defaultImage = this._page.createElement(`img`, {
            width: IMAGE_DIMENSIONS.toString(),
            height: IMAGE_DIMENSIONS.toString(),
            src: this._defaultImageSrc,
        })[0]! as HTMLImageElement;

        this._jdenticonCanvas = canvas;
        this._jdenticonCtx = canvas.getContext(`2d`)!;

        this._applicationPreferencesBindingContext.on(`change`, () => {
            this._preferenceChanged(this._applicationPreferencesBindingContext.getPreference(`enableAlbumArt`));
        });
    }

    size() {
        return (IMAGE_DIMENSIONS * this._page.devicePixelRatio()) | 0;
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

    imageErrored = async (e: Event) => {
        const target = e.target as ExpandoImage;
        if (target === this._currentImage) {
            target.albumArtTrackUid = undefined;
            const track = this._currentTrack;
            if (track) {
                const image = await this.generateImageForTrack(track);
                if (this._currentTrack === track) {
                    this.updateImage(image);
                }
            }
        }
    };

    imageLoaded = (e: Event) => {
        const target = e.target as ExpandoImage;
        if (target === this._currentImage) {
            this.emit("imageChanged", target);
        }
    };

    updateImage(image?: ExpandoImage) {
        if (!image) return;

        if (this._currentImage && isSameImage(this._currentImage, image)) {
            return;
        }

        if (this._currentImage) {
            this._page
                .$(this._currentImage)
                .removeEventListener(`error`, this.imageErrored)
                .removeEventListener(`load`, this.imageLoaded)
                .remove();
            this._currentImage = null;
        }

        this._currentImage = image;
        this.$().append(this._currentImage);

        if (!this._currentImage.isGenerated) {
            this._page.$(this._currentImage).addEventListener(`error`, this.imageErrored);
            this._page.$(this._currentImage).addEventListener(`load`, this.imageLoaded);

            if (this._currentImage.complete) {
                this.emit("imageChanged", this._currentImage);
            }
        } else {
            this.emit("imageChanged", this._currentImage);
        }
    }

    _onAlbumArt = (track: Track, albumArt: string | string[] | null, reason: string) => {
        if (!this._isEnabled()) return;

        if (!albumArt) {
            return;
        }

        const albumArtSrc = Array.isArray(albumArt) ? albumArt[0]! : albumArt;

        if (requestReason === reason) {
            if (this._currentImage && this._currentImage.src === albumArtSrc) {
                return;
            }

            if (!this._currentTrack) {
                return;
            }
            const equalsCurrent = this._currentTrack.uidEquals(track.uid());

            if (!equalsCurrent) {
                return;
            }

            const image = new Image() as ExpandoImage;
            image.src = albumArtSrc;
            image.albumArtTrackUid = track.uid();

            this.updateImage(image);
        }
    };

    _fetchCurrentTrackAlbumArt() {
        if (!this._isEnabled() || !this._currentTrack) return;
        const track = this._currentTrack;
        if (this.isCurrentImageAlbumArtForCurrentTrack()) {
            return;
        }

        const { _album: album, _artist: artist } = track;
        if (album && artist) {
            this._metadataManager.getAlbumArt(track, {
                album: album,
                artist: artist,
                preference,
                requestReason,
                trackUid: track.uid(),
            });
        } else {
            // TODO: Change pic
        }
    }

    _trackTagDataUpdated = () => {
        this._fetchCurrentTrackAlbumArt();
    };

    _isEnabled() {
        return this._enabled;
    }

    _preferenceChanged = (enabled: boolean) => {
        this._enabled = enabled;
        this._fetchCurrentTrackAlbumArt();
        // TODO: Change dom dimensions and hide element
    };

    _trackChanged = async (track: Track) => {
        if (track === this._currentTrack) {
            return;
        }

        if (this._currentTrack) {
            this._currentTrack.removeListener("tagDataUpdated", this._trackTagDataUpdated);
            this._currentTrack = null;
        }
        if (track) {
            this._currentTrack = track;
            this._fetchCurrentTrackAlbumArt();
            this._currentTrack.on("tagDataUpdated", this._trackTagDataUpdated);
            const generatedImage = await this.generateImageForTrack(track);
            if (track === this._currentTrack) {
                if (this.isCurrentImageAlbumArtForCurrentTrack()) {
                    return;
                }
                this.updateImage(generatedImage);
            }
        }
    };

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

    async generateImageForTrack(track: Track): Promise<ExpandoImage> {
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
                const image = this._generatedImages.get(cachedKey)!;
                if (this._currentImage && this._currentImage.src === image.src) {
                    continue;
                }

                try {
                    URL.revokeObjectURL(image.src);
                } catch (e) {
                    // NOOP
                }
                image.blob = undefined;
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
        const image = await canvasToImage(this._jdenticonCanvas);
        this._generatedImages.set(key, image);
        return image;
    }
}
