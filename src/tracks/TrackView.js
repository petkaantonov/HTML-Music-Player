import {VIEW_UPDATE_EVENT} from "metadata/MetadataManagerFrontend";

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
    constructor(track, index, opts) {
        opts = Object(opts);
        this._opts = opts;
        this._track = track;
        this._isDestroyed = false;
        this._index = index;
        this._error = null;
        this._domNode = null;
        this._isAttached = false;
        this._dragged = false;
        this._offset = 0;
        this._viewUpdated = this._viewUpdated.bind(this);
        this._track.on(VIEW_UPDATE_EVENT, this._viewUpdated);
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
        this.viewUpdatePlayingStatusChange();
        this.viewUpdateErrorStatusChange();

        this._updateTranslate();

        if (!recycledDomNode && target) {
            this.$().appendTo(target);
        }
    }

    isDestroyed() {
        return this._isDestroyed;
    }

    destroy() {
        if (this._isDestroyed) return null;
        this._track.removeListener(VIEW_UPDATE_EVENT, this._viewUpdated);
        this._isDestroyed = true;
        const ret = this.detach();
        if (ret) {
            ret.remove();
        }
        this.setIndex(-1);
        return ret;
    }

    isVisible() {
        return this._isAttached;
    }

    setIndex(index) {
        if (this._index !== index) {
            this._index = index;
            if (this._shouldUpdateDom()) {
                this._updateTranslate();
                this._renderTrackNumber();
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

    _renderTrackInfo() {
        const {artist, title} = this._track;

        this.$().find(`.track-title`).setText(title);
        this.$().find(`.track-artist`).setText(artist);
    }

    _renderTrackNumber() {
        const index = this.getIndex();
        const trackNumber = index >= 0 ? `${index + 1}.` : ``;
        this.$trackNumber().setText(trackNumber);
    }

    _renderTrackDuration() {
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

    viewUpdatePlayingStatusChange() {
        if (!this._shouldUpdateDom()) return;
        if (this._track.isPlaying()) {
            this.$().addClass(`track-playing`);
        } else {
            this.$().removeClass(`track-playing`);
        }
    }

    viewUpdateErrorStatusChange() {
        if (!this._shouldUpdateDom()) return;
        if (this._track.hasError()) {
            this.$().addClass(`track-error`);
        } else {
            this.$().removeClass(`track-error`);
        }
    }

    viewUpdateTagDataChange() {
        if (!this._shouldUpdateDom()) return;
        this._renderTrackNumber();
        this._renderTrackDuration();
        this._renderTrackInfo();
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
