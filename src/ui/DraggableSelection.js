import {noUndefinedGet} from "util";
import Selectable from "ui/Selectable";
import EventEmitter from "events";
import {isTouchEvent, preventDefaultHandler} from "platform/dom/Page";

const DRAG_START_DELAY_MS = 300;

export default class DraggableSelection extends EventEmitter {
    constructor(opts, deps) {
        super();
        opts = noUndefinedGet(opts);
        this._page = deps.page;
        this._recognizerContext = deps.recognizerContext;
        this._globalEvents = deps.globalEvents;

        this._mustMatchSelector = opts.mustMatchSelector;
        this._mustNotMatchSelector = opts.mustNotMatchSelector;
        this._fixedItemListScroller = opts.scroller;
        this._domNode = this._page.$(opts.target).eq(0);
        this._listView = opts.listView;
        this._selection = null;
        this._previousRawY = -1;
        this._currentReferenceItemView = -1;
        this._dragStartDelayId = -1;
        this._holdingStartedY = -1;
        this._draggableDirections = {down: false, up: false};
        this._startDragFromTimeout = this._startDragFromTimeout.bind(this);
        this._onMovement = this._onMovement.bind(this);
        this._onMouseRelease = this._onMouseRelease.bind(this);
        this._onItemViewMouseDown = this._onItemViewMouseDown.bind(this);
        this._onReLayout = this._onReLayout.bind(this);
        this._restart = this._restart.bind(this);
        this._onTouchmove = this._onTouchmove.bind(this);
        this._onTouchend = this._onTouchend.bind(this);
        this._dragRecognizer = this._recognizerContext.createModifierDragRecognizer(this._onTouchmove, this._onTouchend);
        this._touchdownRecognizer = this._recognizerContext.createModifierTouchdownRecognizer(this._onItemViewMouseDown);
        this._isDragging = false;
        this._dragStartFired = false;
        this._scroll = this._scroll.bind(this);
        this._scrollIntervalId = -1;
        this._justStoppedDragging = false;
    }

    recentlyStoppedDragging() {
        return this._justStoppedDragging;
    }

    bindEvents() {
        this._touchdownRecognizer.recognizeBubbledOn(this.$());
        this.$().addEventListener(`mousedown`, this._onItemViewMouseDown);
        this.$().addEventListener(`selectstart`, preventDefaultHandler);
    }

    isDragging() {
        return this._isDragging;
    }

    _clearScrollInterval() {
        this._page.clearInterval(this._scrollIntervalId);
        this._scrollIntervalId = -1;
    }

    _startDragFromTimeout() {
        const yMoved = Math.abs(this._holdingStartedY - this._previousRawY);
        this._dragStartDelayId = -1;
        if (yMoved > this._fixedItemListScroller.itemHeight()) {
            this._onMouseRelease();
        } else {
            this._fireDragStart();
        }
    }

    _startDragStartDelay() {
        this._justStoppedDragging = false;
        this._clearDragStartDelay();
        this._dragStartDelayId = this._page.setTimeout(this._startDragFromTimeout, DRAG_START_DELAY_MS);
    }

    _clearDragStartDelay() {
        this._page.clearTimeout(this._dragStartDelayId);
        this._dragStartDelayId = -1;
    }

    _scroll() {
        const edge = this._fixedItemListScroller.getEdgeByCoordinateWithinMargin(this._previousRawY,
                                                                               this._fixedItemListScroller.itemHeight());
        this._fixedItemListScroller.scrollBy(edge * this._fixedItemListScroller.itemHeight());

        if (edge !== 0) {
            this._onMovement({clientY: this._previousRawY, type: `scroll`, which: 1});
        }
    }

    $() {
        return this._domNode;
    }

    _onReLayout() {
        this._currentReferenceItemView = this._fixedItemListScroller.indexByYCoordinate(this._previousRawY);
    }

    _onTouchmove(e) {
        return this._onMovement(e);
    }

    _onTouchend(e) {
        return this._onMouseRelease(e);
    }

    _onMouseRelease() {
        this._clearDragStartDelay();
        if (!this._isDragging) return;
        const dragStartWasFired = this._dragStartFired;
        this._dragStartFired = false;
        this._isDragging = false;
        this.$().removeEventListener(`scroll`, this._onMovement);

        this._page.removeDocumentListener(`mousemove`, this._onMovement);
        this._page.removeDocumentListener(`mouseup`, this._onMouseRelease);
        this._globalEvents.removeListener(`resize`, this._onReLayout);
        this._dragRecognizer.unrecognizeBubbledOn(this._page.document());

        this._listView.removeListener(`tracksSelected`, this._restart);
        this._listView.removeListener(`lengthChange`, this._restart);
        this._listView.removeListener(`trackOrderChange`, this._restart);

        this._holdingStartedY = this._currentReferenceItemView = this._previousRawY = -1;
        this._clearScrollInterval();
        if (dragStartWasFired) {
            for (let i = 0; i < this._selection.length; ++i) {
                this._selection[i].stopDragging();
            }
        }
        this._selection = null;
        this.emit(`dragEnd`);

        if (dragStartWasFired) {
            this._justStoppedDragging = true;
            this._dragStartDelayId = this._page.setTimeout(() => {
                this._justStoppedDragging = false;
            }, 13);
        }
    }

    _fireDragStart() {
        if (!this._dragStartFired && this._isDragging) {
            this._dragStartFired = true;
            this.emit(`dragStart`);
            for (let i = 0; i < this._selection.length; ++i) {
                this._selection[i].startDragging();
            }
        }
    }

    _onMovement(e) {
        if (!isTouchEvent(e) && e.which !== 1) {
            this._onMouseRelease();
            return;
        }

        const clientY = typeof e.clientY === `number` ? e.clientY : this._previousRawY;
        this._previousRawY = clientY;

        if (!this._dragStartFired) {
            return;
        }

        if (this._scrollIntervalId === -1) {
            this._scrollIntervalId = this._page.setInterval(this._scroll, 100);
        }

        const itemHeight = this._fixedItemListScroller.itemHeight();

        const y = this._fixedItemListScroller.mapYCoordinate(clientY);
        const selection = this._selection;
        const itemViews = this._listView.getTrackViews();
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
            this._currentReferenceItemView = Math.min(this._listView.length - 1, this._currentReferenceItemView + distance);
            Selectable.moveSelectedItemViewsDownBy(itemViews, selection, distance);
            changed = true;
            referenceY = this._currentReferenceItemView * itemHeight;
        }

        for (let i = 0; i < selection.length; ++i) {
            selection[i].setOffset(y - referenceY);
        }

        if (changed) {
            this._determineDraggableDirections(selection);
            this._listView.trackIndexChanged();
        }
    }

    _restart() {
        const oldSelection = this._selection.slice();
        this._selection = this._listView.getSelection();

        if (this._dragStartFired) {
            for (let i = 0; i < oldSelection.length; ++i) {
                const itemView = oldSelection[i];

                if (!this._listView.isSelected(itemView)) {
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
            this._draggableDirections.down = selection[selection.length - 1].getIndex() < this._listView.length - 1;
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
        if (this._mustMatchSelector && !$target.closest(this._mustMatchSelector).length) {
            return;
        }

        if (this._mustNotMatchSelector && $target.closest(this._mustNotMatchSelector).length) {
            return;
        }

        if (!this._listView.getSelectedItemViewCount()) {
            return;
        }

        if (isTouchEvent(e) &&
            (!this._listView.selectionContainsAnyItemViewsBetween(e.clientY, e.clientY) ||
            e.isFirst === false)) {
            return;
        }

        const selection = this._listView.getSelection();
        this._determineDraggableDirections(selection);
        this._selection = selection;

        this._startDragStartDelay();
        this._isDragging = true;
        this._previousRawY = e.clientY;
        this._holdingStartedY = e.clientY;

        this._onReLayout();

        this._page.addDocumentListener(`mousemove`, this._onMovement);
        this._page.addDocumentListener(`mouseup`, this._onMouseRelease);
        this._globalEvents.on(`resize`, this._onReLayout);
        this._dragRecognizer.recognizeBubbledOn(this._page.document());
        this._listView.on(`tracksSelected`, this._restart);
        this._listView.on(`lengthChange`, this._restart);
        this._listView.on(`trackOrderChange`, this._restart);
    }
}
