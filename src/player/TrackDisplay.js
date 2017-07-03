import {noUndefinedGet} from "util";

export default class TrackDisplay {
    constructor(opts, deps) {
        opts = noUndefinedGet(opts);
        this._page = deps.page;
        this._globalEvents = deps.globalEvents;
        this._playlist = deps.playlist;
        this._defaultTitle = deps.defaultTitle;
        this._containerNode = this._page.$(opts.target).eq(0);
        this._domNode = this.$container().find(opts.displayTarget);
        this._delay = +opts.delay || 5000;
        this._pixelsPerSecond = +opts.pixelsPerSecond || 22;

        this._currentDelayId = -1;
        this._direction = `normal`;
        this._currentAnimation = null;
        this._currentTrack = null;

        this._containerWidth = -1;
        this._contentWidth = -1;

        this._update = this._update.bind(this);
        this._windowResized = this._windowResized.bind(this);
        this._globalEvents.on(`foreground`, this._windowResized);
        this._globalEvents.on(`resize`, this._windowResized);
        this._playlist.on(`trackPlayingStatusChange`, this._trackChanged.bind(this));

        this._update();
    }

    $() {
        return this._domNode;
    }

    $container() {
        return this._containerNode;
    }

    _updateText() {
        const track = this._currentTrack;

        if (track) {
            const index = track.getIndex();
            const trackNumber = index >= 0 ? `${index + 1}. ` : ``;
            const title = trackNumber + track.formatFullName();
            this.$().setText(title);
            this._page.setTitle(title);
        } else {
            this.$().setText(``);
            this._page.setTitle(this._defaultTitle);
        }
    }

    _update() {
        this._updateText();
        this._reset();
    }

    _trackChanged(track) {
        if (!track) track = null;
        this.setTrack(track);
    }

    _windowResized() {
        this._reset();
    }

    _getScrollWidth() {
        const ret = Math.max(-5, this._contentWidth - this._containerWidth) + 5;
        return Math.max(0, ret);
    }

    _start(duration, scrollWidth) {
        this._currentDelayId = this._page.setTimeout(() => {
            this._runAnimation(duration, scrollWidth);
        }, this._delay);
    }

    _runAnimation(duration, scrollWidth) {
        if (this._currentAnimation) {
            this._currentAnimation.onfinish = null;
            this._currentAnimation = null;
        }

        const anim = this.$().animateTranslate(0, 0, -scrollWidth, 0, {
            fill: `none`,
            duration,
            easing: `linear`,
            noComposite: true,
            direction: this._direction
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
            this._containerWidth = this.$container()[0].getBoundingClientRect().width;
            this._contentWidth = this.$()[0].getBoundingClientRect().width;
        }

        const scrollWidth = this._getScrollWidth();
        const duration = (scrollWidth / this._pixelsPerSecond * 1000) | 0;

        if (duration > 0) {
            this._start(duration, scrollWidth);
        }
    }

    setTrack(track) {
        if (this._currentTrack === track) return;
        if (this._currentTrack) {
            this._currentTrack.removeListener(`indexChange`, this._update);
            this._currentTrack.removeListener(`tagDataUpdate`, this._update);
        }
        this._currentTrack = track;

        if (track) {
            this._currentTrack.on(`indexChange`, this._update);
            this._currentTrack.on(`tagDataUpdate`, this._update);
        }
        this._update();
    }

}
