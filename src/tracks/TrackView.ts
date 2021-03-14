import { Track, TrackEventsMap } from "metadata/MetadataManagerFrontend";
import { DomWrapper, DomWrapperSelector } from "platform/dom/Page";

import TrackViewOptions from "./TrackViewOptions";

export const ITEM_HEIGHT = 44;

const TEMPLATE = `
    <div class="grid-item track-number js-track-number"></div>
    <div class="grid-item track-title js-track-title"></div>
    <div class="grid-item track-artist js-track-artist"></div>
    <div class="grid-item track-duration js-track-duration"></div>
    <div class="grid-item track-menu-button js-track-menu-button js-has-primary-action material-icons selection-menu-options"></div>
    <div class="grid-item track-select-control js-track-select-button js-has-primary-action material-icons blank-checkbox js-track-selection-indicator"></div>
    <div class="grid-item track-drag-control js-track-drag-button js-has-primary-action material-icons reorder">
`;

export default class TrackView {
    private _opts: TrackViewOptions;
    private _track: Track;
    private _isDestroyed: boolean;
    _index: number;
    _domNode: null | DomWrapper;
    private _isAttached: boolean;
    private _dragged: boolean;
    private _offset: number;
    private _viewUpdated: (e: Parameters<TrackEventsMap["viewUpdated"]>[0]) => void;
    constructor(track: Track, index: number, opts: TrackViewOptions) {
        this._opts = opts;
        this._track = track;
        this._isDestroyed = false;
        this._index = index;
        this._domNode = null;
        this._isAttached = false;
        this._dragged = false;
        this._offset = 0;
        this._viewUpdated = (e: Parameters<TrackEventsMap["viewUpdated"]>[0]) => {
            switch (e) {
                case "viewUpdateErrorStatusChange":
                    this.viewUpdateErrorStatusChange();
                    break;
                case "viewUpdatePlayingStatusChange":
                    this.viewUpdatePlayingStatusChange();
                    break;

                case "viewUpdateTagDataChange":
                    this.viewUpdateTagDataChange();
                    break;
            }
        };
        this._track.on("viewUpdated", this._viewUpdated);
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
        return this._domNode!;
    }

    $trackNumber() {
        return this.$().findOneUnsafe(`.js-track-number`);
    }

    $trackDuration() {
        return this.$().findOneUnsafe(`.js-track-duration`);
    }

    $trackSelectionIndicator() {
        return this.$().findOneUnsafe(`.js-track-selection-indicator`);
    }

    track() {
        return this._track;
    }

    _shouldUpdateDom() {
        return this._domNode !== null;
    }

    _ensureDomNode(target: DomWrapperSelector, recycledDomNode?: DomWrapper) {
        if (this._shouldUpdateDom()) return;

        this._domNode =
            recycledDomNode ||
            this.page()
                .createElement(`div`, {
                    class: `track-container js-track-container`,
                })
                .setHtml(TEMPLATE);

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
        this._track.removeListener("viewUpdated", this._viewUpdated);
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

    setIndex(index: number) {
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

    _renderTrackInfo() {
        const { artist, title } = this._track;

        this.$().findOneUnsafe(`.js-track-title`).setText(title);
        this.$().findOneUnsafe(`.js-track-artist`).setText(artist);
    }

    _renderTrackNumber() {
        const index = this.getIndex();
        const trackNumber = index >= 0 ? `${index + 1}.` : ``;
        this.$trackNumber().setText(trackNumber);
    }

    _renderTrackDuration() {
        this.$trackDuration().setText(this._track.formatTime());
    }

    attach(target: DomWrapperSelector, node?: DomWrapper) {
        this._ensureDomNode(target, node);
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

    setOffset(value: number) {
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
