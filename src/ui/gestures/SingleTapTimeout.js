export default function SingleTapTimeout(recognizer, successHandler, clearHandler, timeout) {
    this.id = setTimeout(this.timeoutHandler.bind(this), timeout);
    this.successHandler = successHandler;
    this.clearHandler = clearHandler;
    this.recognizer = recognizer;
}

SingleTapTimeout.prototype.timeoutHandler = function() {
    this.remove();
    this.successHandler.call(null);
};

SingleTapTimeout.prototype.clear = function() {
    this.remove();
    clearTimeout(this.id);
    this.clearHandler.call(null);
};

SingleTapTimeout.prototype.remove = function() {
    this.recognizer.singleTapTimeoutRemoved(this);
};
