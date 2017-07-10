export default function SingleTapTimeout(recognizer, successHandler, clearHandler, timeout) {
    this.recognizer = recognizer;
    this.id = this.recognizer.page.setTimeout(this.timeoutHandler.bind(this), timeout);
    this.successHandler = successHandler;
    this.clearHandler = clearHandler;
}

SingleTapTimeout.prototype.timeoutHandler = function() {
    this.remove();
    this.successHandler.call(null);
};

SingleTapTimeout.prototype.clear = function() {
    this.remove();
    this.recognizer.page.clearTimeout(this.id);
    this.clearHandler.call(null);
};

SingleTapTimeout.prototype.remove = function() {
    this.recognizer.singleTapTimeoutRemoved(this);
};
