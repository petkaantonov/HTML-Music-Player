export default class GestureObject {
    constructor(e, touch, isFirst) {
        this.clientX = touch.clientX;
        this.clientY = touch.clientY;
        this.pageX = touch.pageX;
        this.pageY = touch.pageY;
        this.screenX = touch.screenX;
        this.screenY = touch.screenY;
        this.timeStamp = e.timeStamp;
        this.target = e.target;
        this.currentTarget = e.currentTarget;
        this.type = e.type;
        this.isFirst = !!isFirst;
        this.originalEvent = e.originalEvent ? e.originalEvent : e;
    }

    preventDefault() {
        return this.originalEvent.preventDefault();
    }
    stopPropagation() {
        return this.originalEvent.stopPropagation();
    }
    stopImmediatePropagation() {
        return this.originalEvent.stopImmediatePropagation();
    }
}
