import {VIEW_UPDATE_EVENT} from "metadata/MetadataManagerFrontend";

export const ITEM_HEIGHT = 44;

const TEMPLATE = `<div class='track not-draggable'>
    <div class='track-left-controls'>
        <div class='track-control-menu'>
            <div class='material-icons large-material-icon selection-menu-options'></div>
        </div>
        <div class='track-control-select'>
            <div class='material-icons large-material-icon blank-checkbox track-selection-indicator'></div>
        </div>
    </div>
    <div class='track-data'>
        <div class='track-number-container'>
            <div class='track-number notextflow'></div>
        </div>
        <div class='track-info'>
            <div class='track-title notextflow'></div>
            <div class='track-artist notextflow'></div>
        </div>
        <div class='track-duration-container'>
            <div class='track-duration notextflow'></div>
        </div>
    </div>
    <div class='track-right-controls track-control-reorder'>
        <div class='material-icons large-material-icon reorder'></div>
    </div>
</div>`;

const DRAGGABLE_TEMPLATE = TEMPLATE.replace(`not-draggable`, `draggable`);

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

    itemHeight() {
        return this._opts.itemHeight;
    }

    controller() {
        return this._opts.controller;
    }

    $() {
        return this._domNode;
    }

    $trackNumber() {
        return this.$().findOneUnsafe(`.track-number`);
    }

    $trackDuration() {
        return this.$().findOneUnsafe(`.track-duration`);
    }

    $trackSelectionIndicator() {
        return this.$().findOneUnsafe(`.track-selection-indicator`);
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
        }).setHtml(this.controller().supportsDragging() ? DRAGGABLE_TEMPLATE : TEMPLATE);

        if (this.selectable().contains(this)) {
            this.selected();
        } else {
            this.unselected();
        }

        if (this.controller().supportsDragging()) {
            if (this._dragged) {
                this.$().addClass(`track-dragging`);
            } else {
                this.$().removeClass(`track-dragging`);
            }
        }

        this.viewUpdateTagDataChange();
        this.viewUpdatePlayingStatusChange();
        this.viewUpdateErrorStatusChange();

        this._updateTranslate();

        if (target && !this._domNode.hasParent()) {
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

        this.$().findOneUnsafe(`.track-title`).setText(title);
        this.$().findOneUnsafe(`.track-artist`).setText(artist);
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
        this._renderTrackInfo();
        this._renderTrackDuration();
        this._renderTrackNumber();
    }

    _updateTranslate() {
        this.$().setTransform(this._getTranslate());
    }

    _getTranslate() {
        const index = this._index;
        let y = index * this.itemHeight();
        let x = 0;
        if (this._dragged) {
            x -= 2;
            y -= 2;
        }
        y += this._offset;
        return `translate(${x}px, ${y}px)`;
    }

    setOffset(value) {
        this._offset = Math.min(ITEM_HEIGHT, value);
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
