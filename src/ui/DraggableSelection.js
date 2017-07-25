import {noUndefinedGet} from "util";
import EventEmitter from "events";
import {isTouchEvent, preventDefaultHandler} from "platform/dom/Page";
import {ITEM_ORDER_CHANGE_EVENT,
        LENGTH_CHANGE_EVENT} from "tracks/TrackContainerController";
import Selectable, {ITEMS_SELECTED_EVENT} from "ui/Selectable";

export default class DraggableSelection extends EventEmitter {
    constructor(opts, deps) {
        super();
        opts = noUndefinedGet(opts);
        this._page = deps.page;
        this._recognizerContext = deps.recognizerContext;
        this._globalEvents = deps.globalEvents;
        this._env = deps.env;

        this._controller = opts.controller;
        this._selectionProvider = opts.selectionProvider;
        this._beforeDragStartCommitDelay = opts.beforeDragStartCommitDelay;
        this._afterDragEnd = opts.afterDragEnd;
        this._commitDelay = opts.commitDelay;

        this._selection = null;
        this._previousRawY = -1;
        this._currentReferenceItemView = -1;
        this._dragStartCommitDelayId = -1;
        this._holdingStartedY = -1;
        this._draggableDirections = {down: false, up: false};
        this._checkIfDragShouldBeCommitted = this._checkIfDragShouldBeCommitted.bind(this);
        this._onMovement = this._onMovement.bind(this);
        this._onMouseRelease = this._onMouseRelease.bind(this);
        this._onItemViewMouseDown = this._onItemViewMouseDown.bind(this);
        this._onReLayout = this._onReLayout.bind(this);
        this._restart = this._restart.bind(this);
        this._onTouchmove = this._onTouchmove.bind(this);
        this._onTouchend = this._onTouchend.bind(this);
        this._dragRecognizer = this._recognizerContext.createDragRecognizer(this._onTouchmove, this._onTouchend);
        this._touchdownRecognizer = this._recognizerContext.createTouchdownRecognizer(this._onItemViewMouseDown);
        this._isDragging = false;
        this._dragStartCommitted = false;
        this._scroll = this._scroll.bind(this);
        this._scrollIntervalId = -1;
        this._committedDragRecently = false;
    }

    get itemHeight() {
        return this._controller.getScroller().itemHeight();
    }

    getScroller() {
        return this._controller.getScroller();
    }

    hasTouch() {
        return this._env.hasTouch();
    }

    recentlyStoppedDragging() {
        return this._committedDragRecently;
    }

    bindEvents() {
        if (this.hasTouch()) {
            this._touchdownRecognizer.recognizeBubbledOn(this.$());
        } else {
            this.$().addEventListener(`mousedown`, this._onItemViewMouseDown);
        }
        this.$().addEventListener(`selectstart`, preventDefaultHandler);
    }

    isDragging() {
        return this._isDragging;
    }

    _clearScrollInterval() {
        this._page.clearInterval(this._scrollIntervalId);
        this._scrollIntervalId = -1;
    }

    _checkIfDragShouldBeCommitted() {
        const yMoved = Math.abs(this._holdingStartedY - this._previousRawY);
        this._dragStartCommitDelayId = -1;
        if (yMoved > this.itemHeight) {
            this._onMouseRelease();
        } else {
            this._commitDragStart();
        }
    }

    _startDragStartCommitDelay() {
        this._committedDragRecently = false;
        this._clearDragStartCommitDelay();
        this._dragStartCommitDelayId = this._page.setTimeout(this._checkIfDragShouldBeCommitted, this._commitDelay);
    }

    _clearDragStartCommitDelay() {
        this._page.clearTimeout(this._dragStartCommitDelayId);
        this._dragStartCommitDelayId = -1;
    }

    _scroll() {
        const edge = this.getScroller().getEdgeByCoordinateWithinMargin(this._previousRawY, this.itemHeight);
        this.getScroller().scrollBy(edge * this.itemHeight);

        if (edge !== 0) {
            this._onMovement({clientY: this._previousRawY, type: `scroll`, buttons: 1});
        }
    }

    $() {
        return this._controller.$();
    }

    _onReLayout() {
        this._currentReferenceItemView = this.getScroller().indexByYCoordinate(this._previousRawY);
    }

    _onTouchmove(e) {
        return this._onMovement(e);
    }

    _onTouchend(e) {
        return this._onMouseRelease(e);
    }

    _onMouseRelease() {
        this._clearDragStartCommitDelay();
        if (!this._isDragging) return;
        const dragStartWasCommitted = this._dragStartCommitted;
        this._dragStartCommitted = false;
        this._isDragging = false;
        this.$().removeEventListener(`scroll`, this._onMovement);

        if (this.hasTouch()) {
            this._dragRecognizer.unrecognizeBubbledOn(this._page.document());
        } else {
            this._page.removeDocumentListener(`mousemove`, this._onMovement);
            this._page.removeDocumentListener(`mouseup`, this._onMouseRelease);
        }
        this._globalEvents.removeListener(`resize`, this._onReLayout);

        this._controller.removeListener(ITEMS_SELECTED_EVENT, this._restart);
        this._controller.removeListener(LENGTH_CHANGE_EVENT, this._restart);
        this._controller.removeListener(ITEM_ORDER_CHANGE_EVENT, this._restart);

        this._holdingStartedY = this._currentReferenceItemView = this._previousRawY = -1;
        this._clearScrollInterval();
        if (dragStartWasCommitted) {
            for (let i = 0; i < this._selection.length; ++i) {
                this._selection[i].stopDragging();
            }
        }
        this._selection = null;
        this.emit(`dragEnd`);

        if (dragStartWasCommitted) {
            this._committedDragRecently = true;
            this._dragStartCommitDelayId = this._page.setTimeout(() => {
                this._committedDragRecently = false;
            }, 13);
        }
        this._afterDragEnd();
    }

    _commitDragStart() {
        if (!this._dragStartCommitted && this._isDragging) {
            this._dragStartCommitted = true;
            this.emit(`dragStart`);
            for (let i = 0; i < this._selection.length; ++i) {
                this._selection[i].startDragging();
            }
        }
    }

    _onMovement(e) {
        if (!isTouchEvent(e) && ((e.buttons & 1) !== 1)) {
            this._onMouseRelease();
            return;
        }

        const clientY = typeof e.clientY === `number` ? e.clientY : this._previousRawY;
        this._previousRawY = clientY;
        const {itemHeight} = this;

        if (!this._dragStartCommitted) {
            this._anchorY = this.getScroller().mapYCoordinate(clientY) % itemHeight;
            return;
        }

        if (this._scrollIntervalId === -1) {
            this._scrollIntervalId = this._page.setInterval(this._scroll, 100);
        }


        const y = this.getScroller().mapYCoordinate(clientY);
        const selection = this._selection;
        const itemViews = this._controller.getTrackViews();
        let referenceY = this._currentReferenceItemView * itemHeight;

        let changed = false;
        if (y < referenceY && this._draggableDirections.up) {
            const distance = Math.floor((referenceY - y) / itemHeight) + 1;
            this._currentReferenceItemView = Math.max(0, this._currentReferenceItemView - distance);
            Selectable.moveSelectedItemViewsUpBy(itemViews, selection, distance);
            changed = true;
            referenceY = this._currentReferenceItemView * itemHeight;
        } else if (y > (referenceY + itemHeight) && this._draggableDirections.down) {
            const distance = Math.floor((y - (referenceY + itemHeight)) / itemHeight) + 1;
            this._currentReferenceItemView = Math.min(this._controller.length - 1, this._currentReferenceItemView + distance);
            Selectable.moveSelectedItemViewsDownBy(itemViews, selection, distance);
            changed = true;
            referenceY = this._currentReferenceItemView * itemHeight;
        }

        for (let i = 0; i < selection.length; ++i) {
            selection[i].setOffset(y - referenceY - this._anchorY);
        }

        if (changed) {
            this._determineDraggableDirections(selection);
            this._controller.trackIndexChanged();
        }
    }

    _restart() {
        const oldSelection = this._selection.slice();
        this._selection = this._selectionProvider();

        if (this._dragStartCommitted) {
            for (let i = 0; i < oldSelection.length; ++i) {
                const itemView = oldSelection[i];

                if (!this._controller.isSelected(itemView)) {
                    itemView.stopDragging();
                }
            }

            for (let i = 0; i < this._selection.length; ++i) {
                this._selection[i].startDragging();
            }

            this._determineDraggableDirections(this._selection);
        }

        if (!this._selection.length) {
            this._onMouseRelease();
            return;
        }
        this._onReLayout();
    }

    _determineDraggableDirections(selection) {
        if (selection.length > 0) {
            this._draggableDirections.down = selection[selection.length - 1].getIndex() < this._controller.length - 1;
            this._draggableDirections.up = selection[0].getIndex() > 0;
        } else {
            this._draggableDirections.down = this._draggableDirections.up = false;
        }
    }

    _onItemViewMouseDown(e) {
        if (this._isDragging) {
            return;
        }
        const $target = this._page.$(e.target);

        if (!this._beforeDragStartCommitDelay($target)) {
            return;
        }

        const selection = this._selectionProvider();

        if (!selection.length) {
            return;
        }

        this._determineDraggableDirections(selection);
        this._selection = selection;

        this._startDragStartCommitDelay();
        this._isDragging = true;
        this._previousRawY = e.clientY;
        this._holdingStartedY = e.clientY;
        this._anchorY = this.getScroller().mapYCoordinate(e.clientY) % 44;

        this._onReLayout();


        if (this.hasTouch()) {
            this._dragRecognizer.recognizeBubbledOn(this._page.document());
        } else {
            this._page.addDocumentListener(`mousemove`, this._onMovement);
            this._page.addDocumentListener(`mouseup`, this._onMouseRelease);
        }

        this._globalEvents.on(`resize`, this._onReLayout);
        this._controller.on(ITEMS_SELECTED_EVENT, this._restart);
        this._controller.on(LENGTH_CHANGE_EVENT, this._restart);
        this._controller.on(ITEM_ORDER_CHANGE_EVENT, this._restart);
    }
}
