export default class SingleTapTimeout {
    constructor(recognizer, successHandler, clearHandler, timeout) {
        this.recognizer = recognizer;
        this.id = this.recognizer.page.setTimeout(this.timeoutHandler.bind(this), timeout);
        this.successHandler = successHandler;
        this.clearHandler = clearHandler;
    }

    timeoutHandler() {
        this.remove();
        this.successHandler.call(null);
    }

    clear() {
        this.remove();
        this.recognizer.page.clearTimeout(this.id);
        this.clearHandler.call(null);
    }

    remove() {
        this.recognizer.singleTapTimeoutRemoved(this);
    }
}
