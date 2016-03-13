export default function GestureObject(e, touch, isFirst) {
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

GestureObject.prototype.preventDefault = function() {
    return this.originalEvent.preventDefault();
};
GestureObject.prototype.stopPropagation = function() {
    return this.originalEvent.stopPropagation();
};
GestureObject.prototype.stopImmediatePropagation = function(){
    return this.originalEvent.stopImmediatePropagation();
};
