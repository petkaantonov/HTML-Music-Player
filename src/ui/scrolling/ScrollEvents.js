"use strict";

function ScrollEventsBinding(scrollEvents, target, scroller, shouldScroll, scrollbar) {
    this.scrollEvents = scrollEvents;
    this.shouldScroll = shouldScroll || this.defaultShouldScroll;
    this.target = target;
    this.scroller = scroller;
    this.scrollbar = scrollbar;
    this.stopTimerId = -1;
    this.gestureArray = new Array(1);

    this._mouseWheeled = this._mouseWheeled.bind(this);
    this._verticalDragStart = this._verticalDragStart.bind(this);
    this._verticalDragMove = this._verticalDragMove.bind(this);
    this._verticalDragEnd = this._verticalDragEnd.bind(this);
    this._stopTimedOut = this._stopTimedOut.bind(this);

    this.verticalDragRecognizer = this.scrollEvents.recognizerContext.createVerticalDragRecognizer(
            this._verticalDragStart, this._verticalDragMove, this._verticalDragEnd);

    this.verticalDragRecognizer.recognizeBubbledOn(this.target);

    target.addEventListener("wheel", this._mouseWheeled)
        .addEventListener("mousewheel", this._mouseWheeled)
        .addEventListener("DOMMouseScroll", this._mouseWheeled);
}

ScrollEventsBinding.prototype._mouseWheeled = function(e) {
    e.preventDefault();
    e.stopPropagation();

    var delta;
    if (e.deltaY !== undefined) {
        delta = -e.deltaY * (e.deltaMode === 1 ? 20 : 1);
    } else if (e.wheelDeltaY !== undefined) {
        delta = e.wheelDeltaY / 6;
    } else if (e.wheelDelta !== undefined) {
        delta = e.wheelDelta / 6;
    } else {
        delta = -e.detail * 6.67;
    }

    this.scroller.scrollBy(0, delta * -1, true);
};

ScrollEventsBinding.prototype._verticalDragStart = function(gesture) {
    if (this.shouldScroll()) {
        this.clearStopTimerId();
        this.gestureArray[0] = gesture;
        this.scroller.doTouchStart(this.gestureArray, gesture.timeStamp);
        this.scrollbar.willScroll();
    }
};

ScrollEventsBinding.prototype._verticalDragMove = function(gesture) {
    if (this.shouldScroll()) {
        this.gestureArray[0] = gesture;
        this.scroller.doTouchMove(this.gestureArray, gesture.timeStamp, gesture.originalEvent.scale);
    }
};

ScrollEventsBinding.prototype._verticalDragEnd = function(gesture) {
    this.scroller.doTouchEnd(gesture.timeStamp);
    this.stopTimerId = this.scrollEvents.page.setTimeout(this._stopTimedOut, 500);
};

ScrollEventsBinding.prototype._stopTimedOut = function() {
    this.stopTimerId = -1;
    this.scrollbar.willStopScrolling();
};

ScrollEventsBinding.prototype.clearStopTimerId = function() {
    this.scrollEvents.page.clearTimeout(this.stopTimerId);
    this.stopTimerId = -1;
};

ScrollEventsBinding.prototype.defaultShouldScroll = function() {
    return true;
};

ScrollEventsBinding.prototype.unbind = function() {
    this.verticalDragRecognizer.unrecognizeBubbledOn(this.target);
    this.target.removeEventListener("wheel", this._mouseWheeled)
        .removeEventListener("mousewheel", this._mouseWheeled)
        .removeEventListener("DOMMouseScroll", this._mouseWheeled);
};

export default function ScrollEvents(page, recognizerContext) {
    this.page = page;
    this.recognizerContext = recognizerContext;
}

ScrollEvents.prototype.createBinding = function(target, scroller, shouldScroll, scrollbar) {
    return new ScrollEventsBinding(this, target, scroller, shouldScroll, scrollbar);
};
