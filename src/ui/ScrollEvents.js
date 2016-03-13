"use strict";

const wheelEvents = "wheel mousewheel DOMMouseScroll".split(" ").map(function(v) {
    return v + ".scrollerns";
}).join(" ");

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

    this.verticalDragRecognizer = this.scrollEvents.recognizerMaker.createVerticalDragRecognizer(
            this._verticalDragStart, this._verticalDragMove, this._verticalDragEnd);

    this.verticalDragRecognizer.recognizeBubbledOn(this.target);

    target.on(wheelEvents, this._mouseWheeled);
}

ScrollEventsBinding.prototype._mouseWheeled = function(e) {
    if (e.originalEvent) e = e.originalEvent;
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
    this.stopTimerId = setTimeout(this._stopTimedOut, 500);
};

ScrollEventsBinding.prototype._stopTimedOut = function() {
    this.stopTimerId = -1;
    this.scrollbar.willStopScrolling();
};

ScrollEventsBinding.prototype.clearStopTimerId = function() {
    if (this.stopTimerId !== -1) {
        clearTimeout(this.stopTimerId);
        this.stopTimerId = -1;
    }
};

ScrollEventsBinding.prototype.defaultShouldScroll = function() {
    return true;
};

ScrollEventsBinding.prototype.unbind = function() {
    this.verticalDragRecognizer.unrecognizeBubbledOn(this.target);
    this.target.off(wheelEvents, this._mouseWheeled);
};

export default function ScrollEvents(recognizerMaker) {
    this.recognizerMaker = recognizerMaker;
}

ScrollEvents.prototype.createBinding = function(target, scroller, shouldScroll, scrollbar) {
    return new ScrollEventsBinding(this, target, scroller, shouldScroll, scrollbar);
};
