const TEMPLATE = `<div class='track'>
    <div class='track-control-reorder track-left-controls'>
        <div class='material-icons large-material-icon reorder'></div>
    </div>
    <div class='track-data'>
        <div class='track-number'></div>
        <div class='track-info'>
            <div class='track-title notextflow'></div>
            <div class='track-artist notextflow'></div>
        </div>
        <div class='track-duration'></div>
    </div>
    <div class='track-right-controls'>
        <div class='track-control-select'>
            <div class='material-icons large-material-icon blank-checkbox track-selection-indicator'></div>
        </div>
        <div class='track-control-menu'>
            <div class='material-icons large-material-icon selection-menu-options'></div>
        </div>

    </div>
</div>`;

export default class TrackView {
    constructor(track, opts) {
        opts = Object(opts);
        this._opts = opts;
        this._track = track;
        this._isDestroyed = false;
        this._index = -1;
        this._error = null;
        this._domNode = null;
        this._isAttached = false;
        this._dragged = false;
        this._offset = 0;
        this._viewUpdated = this._viewUpdated.bind(this);
        this._track.on(`viewUpdate`, this._viewUpdated);
    }

    selectable() {
        return this._opts.selectable;
    }

    page() {
        return this._opts.page;
    }

    hasTouch() {
        return this._opts.hasTouch;
    }

    playlist() {
        return this._opts.playlist;
    }

    itemHeight() {
        return this._opts.itemHeight;
    }

    tooltipContext() {
        return this._opts.tooltipContext;
    }

    $() {
        return this._domNode;
    }

    $container() {
        return this.$().find(`.track`);
    }

    $trackNumber() {
        return this.$().find(`.track-number`);
    }

    $trackDuration() {
        return this.$().find(`.track-duration`);
    }

    $trackSelectionIndicator() {
        return this.$().find(`.track-selection-indicator`);
    }

    track() {
        return this._track;
    }

    _shouldUpdateDom() {
        return this._domNode !== null;
    }

    _ensureDomNode(recycledDomNode, target) {
        if (this._shouldUpdateDom()) return;

        this._domNode = recycledDomNode || this.page().createElement(`div`, {
            class: `track-container`
        }).setHtml(TEMPLATE);

        if (this.selectable().contains(this)) {
            this.selected();
        } else {
            this.unselected();
        }

        if (this._dragged) {
            this.$().addClass(`track-dragging`);
        } else {
            this.$().removeClass(`track-dragging`);
        }

        this.viewUpdateTagDataChange();
        this.viewUpdatePlayingStatusChange(this.playlist().getCurrentTrack() === this._track);


        if (this._track.hasError()) {
            this.viewUpdateShowErrorStatus();
        } else {
            this.viewUpdateHideErrorStatus();
        }

        this._updateTranslate();

        if (!recycledDomNode && target) {
            this.$().appendTo(target);
        }
    }

    isDestroyed() {
        return this._isDestroyed;
    }

    destroy() {
        if (this._isDestroyed) return false;
        this._track.removeListener(`viewUpdate`, this._viewUpdated);
        this.setIndex(-1);
        this._isDestroyed = true;
        return true;
    }

    isVisible() {
        return this._isAttached;
    }

    setIndex(index) {
        if (this._index !== index) {
            this._index = index;
            if (this._shouldUpdateDom()) {
                this._updateTranslate();
            }
        }
    }

    getIndex() {
        return this._index;
    }

    _viewUpdated(methodName, ...args) {
        if (args.length > 0) {
            this[methodName](...args);
        } else {
            this[methodName]();
        }
    }

    renderTrackInfo() {
        const artistAndTitle = this._track.getArtistAndTitle();

        this.$().find(`.track-title`).setText(artistAndTitle.title);
        this.$().find(`.track-artist`).setText(artistAndTitle.artist);
    }

    renderTrackNumber() {
        this.$trackNumber().setText(`${this.getIndex() + 1}.`);
    }

    renderTrackDuration() {
        this.$trackDuration().setText(this._track.formatTime());
    }

    attach(target, node) {
        this._ensureDomNode(node, target);
        this._isAttached = true;
    }

    detach() {
        if (this._isAttached) {
            this._isAttached = false;
            const node = this._domNode;
            this._domNode = null;
            return node;
        }
        return null;
    }

    selected() {
        if (!this._shouldUpdateDom()) return;
        if (!this.hasTouch()) {
            this.$().addClass(`track-active`);
        } else {
            this.$trackSelectionIndicator().removeClass(`blank-checkbox`).addClass(`checked-checkbox`);
        }
    }

    unselected() {
        if (!this._shouldUpdateDom()) return;
        if (!this.hasTouch()) {
            this.$().removeClass(`track-active`);
        } else {
            this.$trackSelectionIndicator().addClass(`blank-checkbox`).removeClass(`checked-checkbox`);
        }
    }

    viewUpdateDestroyed() {
        this.destroy();
    }

    viewUpdatePlayingStatusChange(playingStatus) {
        if (!this._shouldUpdateDom()) return;
        if (playingStatus) {
            this.$().addClass(`track-playing`);
        } else {
            this.$().removeClass(`track-playing`);
        }
    }

    viewUpdateShowErrorStatus() {
        if (!this._shouldUpdateDom()) return;
        this.$().addClass(`track-error`).removeClass(`available-offline`);
        // This.$trackStatus().find(`.track-error-status`).show(`inline-block`);
    }

    viewUpdateHideErrorStatus() {
        if (!this._shouldUpdateDom()) return;
        this.$().removeClass(`track-error`);
        // This.$trackStatus().find(`.track-error-status`).hide();
    }

    viewUpdatePositionChange() {
        if (!this._shouldUpdateDom()) return;
        this.renderTrackNumber();
    }

    viewUpdateTagDataChange() {
        if (!this._shouldUpdateDom()) return;
        this.renderTrackNumber();
        this.renderTrackDuration();
        this.renderTrackInfo();
    }

    _updateTranslate() {
        this.$().setTransform(this._getTranslate());
    }

    _getTranslate() {
        const index = this._index;
        let y = index * this.itemHeight();
        let x = 0;
        if (this._dragged) {
            x -= 25;
            y -= 10;
        }
        y += this._offset;
        return `translate(${x}px, ${y}px)`;
    }

    setOffset(value) {
        this._offset = value;
        if (!this._shouldUpdateDom()) return;
        this._updateTranslate();
    }

    startDragging() {
        if (this._dragged) return;
        this._dragged = true;
        if (!this._shouldUpdateDom()) return;
        this.$().addClass(`track-dragging`).removeClass(`transition`);
        this._updateTranslate();
    }

    stopDragging() {
        if (!this._dragged) return;
        this._dragged = false;
        this._offset = 0;
        if (!this._shouldUpdateDom()) return;
        this.$().removeClass(`track-dragging`).addClass(`transition`);
        this._updateTranslate();

        this.page().setTimeout(() => {
            if (!this._shouldUpdateDom()) return;
            this.$().removeClass(`transition`);
        }, 220);

    }
}
