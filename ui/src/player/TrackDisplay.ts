import { SelectDeps } from "ui/Application";
import Page, { DomWrapper, DomWrapperSelector } from "ui/platform/dom/Page";
import GlobalEvents from "ui/platform/GlobalEvents";
import { TrackWithOrigin } from "ui/tracks/TrackContainerController";

import PlaylistController from "./PlaylistController";

type Deps = SelectDeps<"page" | "globalEvents" | "playlist" | "defaultTitle">;
interface Opts {
    target: DomWrapperSelector;
    displayTarget: string;
    delay?: number;
    pixelsPerSecond?: number;
}

export default class TrackDisplay {
    readonly _page: Page;
    readonly _globalEvents: GlobalEvents;
    readonly _playlist: PlaylistController;
    readonly _defaultTitle: string;
    private _containerNode: DomWrapper;
    private _domNode: DomWrapper;
    private _delay: number;
    private _pixelsPerSecond: number;
    private _currentDelayId: number;
    private _direction: PlaybackDirection;
    private _containerWidth: number;
    private _contentWidth: number;
    private _currentAnimation: null | Animation;
    private _currentPlaylistTrack: null | TrackWithOrigin;

    constructor(opts: Opts, deps: Deps) {
        this._page = deps.page;
        this._globalEvents = deps.globalEvents;
        this._playlist = deps.playlist;
        this._defaultTitle = deps.defaultTitle;
        this._containerNode = this._page.$(opts.target).eq(0);
        this._domNode = this.$container().find(opts.displayTarget);
        this._delay = opts.delay ?? 5000;
        this._pixelsPerSecond = opts.pixelsPerSecond ?? 22;

        this._currentDelayId = -1;
        this._direction = `normal`;
        this._currentAnimation = null;
        this._currentPlaylistTrack = null;

        this._containerWidth = -1;
        this._contentWidth = -1;

        this._globalEvents.on(`foreground`, this._windowResized);
        this._globalEvents.on(`resize`, this._windowResized);
        this._playlist.on("playlistTrackPlayingStatusChanged", this._setPlaylistTrack);
        this._update();
    }

    $() {
        return this._domNode;
    }

    $container() {
        return this._containerNode;
    }

    _equalsCurrentTrack(playlistTrack: TrackWithOrigin) {
        return !!(this._currentPlaylistTrack && this._currentPlaylistTrack.track() === playlistTrack.track());
    }

    _updateText() {
        const playlistTrack = this._currentPlaylistTrack;

        if (playlistTrack && !playlistTrack.isDummy()) {
            const title = `${playlistTrack.formatIndex()}${playlistTrack.formatFullName()}`;
            this.$().setText(title);
            this._page.setTitle(title);
        } else {
            this.$().setText(``);
            this._page.setTitle(this._defaultTitle);
        }
    }

    _update = () => {
        this._updateText();
        this._reset();
    };

    _windowResized = () => {
        this._reset();
    };

    _getScrollWidth() {
        const ret = Math.max(-5, this._contentWidth - this._containerWidth) + 5;
        return Math.max(0, ret);
    }

    _start(duration: number, scrollWidth: number) {
        this._currentDelayId = this._page.setTimeout(() => {
            this._runAnimation(duration, scrollWidth);
        }, this._delay);
    }

    _runAnimation(duration: number, scrollWidth: number) {
        if (this._currentAnimation) {
            this._currentAnimation.onfinish = null;
            this._currentAnimation = null;
        }

        const anim = this.$().animateTranslate(0, 0, -scrollWidth, 0, {
            fill: `none`,
            duration,
            easing: `linear`,
            composite: "replace",
            direction: this._direction,
        });

        anim.onfinish = () => {
            const x = this._direction === `normal` ? -scrollWidth : 0;
            this.$().setTransform(`translate3d(${x}px, 0, 0)`);
            this._direction = this._direction === `normal` ? `reverse` : `normal`;
            this._start(duration, scrollWidth);
        };
        this._currentAnimation = anim;
    }

    _reset() {
        this._direction = `normal`;
        this.$().setTransform(`translate3d(0, 0, 0)`);

        if (this._currentDelayId > 0) {
            this._page.clearTimeout(this._currentDelayId);
            this._currentDelayId = -1;
        }

        if (this._currentAnimation) {
            this._currentAnimation.cancel();
            this._currentAnimation = null;
        }

        if (!this._globalEvents.isWindowBackgrounded()) {
            this._containerWidth = this.$container()[0]!.getBoundingClientRect().width;
            this._contentWidth = this.$()[0]!.getBoundingClientRect().width;
        }

        const scrollWidth = this._getScrollWidth();
        const duration = ((scrollWidth / this._pixelsPerSecond) * 1000) | 0;

        if (duration > 0) {
            this._start(duration, scrollWidth);
        }
    }

    _getCurrentTrack() {
        if (this._currentPlaylistTrack) {
            return this._currentPlaylistTrack.track();
        }
        return null;
    }

    _setPlaylistTrack = (playlistTrack: TrackWithOrigin) => {
        if (this._equalsCurrentTrack(playlistTrack)) return;

        let currentTrack = this._getCurrentTrack();
        if (currentTrack) {
            currentTrack.removeListener("tagDataUpdated", this._update);
        }
        this._currentPlaylistTrack = playlistTrack;
        currentTrack = this._getCurrentTrack();

        if (currentTrack) {
            currentTrack.on("tagDataUpdated", this._update);
        }
        this._update();
    };
}
