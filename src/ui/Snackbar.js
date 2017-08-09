import EventEmitter from "events";
import {delay, noop, noUndefinedGet, animationPromisify} from "util";
import {performance} from "platform/platform";
import {DECELERATE_CUBIC} from "ui/animation/easing";


const DURATION = 470;

const animationOptions = {
    duration: DURATION,
    easing: DECELERATE_CUBIC,
    noComposite: true,
    fill: "both"
};

const NO_TAG = {};
export const NO_OUTCOME = -1;
export const ACTION_CLICKED = 0;
export const DISMISSED = 1;
export const TIMED_OUT = 2;
export const SNACKBAR_HEIGHT = 48;
export const SNACKBAR_WILL_SHOW_EVENT = `snackbarWillShow`;
export const SNACKBAR_DID_HIDE_EVENT = `snackbarDidHide`;

const TEMPLATE = `
    <div class="js-snackbar snackbar no-action">
        <div class="snackbar-title single-line js-snackbar-title">hello</div>
        <div class="snackbar-action js-snackbar-action"></div
    </div>
`;

class SnackbarInstance extends EventEmitter {
    constructor(snackbar, message, opts) {
        super();
        opts = Object(opts);
        this.outcome = NO_OUTCOME;
        this.tag = opts.tag || NO_TAG;
        this.message = message;
        this.opts = opts;
        this.snackbar = snackbar;
        this.visibilityTime = opts.visibilityTime || snackbar.visibilityTime || 5000;

        this._exiting = false;
        this._visible = !snackbar.globalEvents.isWindowBackgrounded();
        this._snackbar = snackbar;
        this._startedShowing = this._visible ? performance.now() : -1;
        this._initialShowing = performance.now();
        this._isHovering = false;
        this._domNode = null;
        this._visibilityChanged = this._visibilityChanged.bind(this);
        this._clicked = this._clicked.bind(this);
        this._timeoutChecker = this._timeoutChecker.bind(this);
        this._mouseEntered = this._mouseEntered.bind(this);
        this._mouseLeft = this._mouseLeft.bind(this);
    }

    show() {
        this.snackbar._snackbarWillShow();
        const {message, opts, snackbar} = this;
        this._initDom(message, opts);
        this.$().addEventListener(`click`, this._clicked);
        this.$().addEventListener(`mouseenter`, this._mouseEntered);
        this.$().addEventListener(`mouseleave`, this._mouseLeft);
        this._snackbar.globalEvents.on(`visibilityChange`, this._visibilityChanged);

        snackbar.recognizerContext.createTapRecognizer(this._clicked).recognizeBubbledOn(this.$());
        this._checkerTimerId = this.page().setTimeout(this._timeoutChecker, this.visibilityTime);
        this.$().animate([
            {transform: "translateY(100%)"},
            {transform: "translateY(0%)"}
        ], animationOptions)
    }

    $() {
        return this._domNode;
    }

    $action() {
        return this.$().find(".js-snackbar-action");
    }

    $title() {
        return this.$().find(".js-snackbar-title");
    }

    _clearTimer() {
        this.page().clearTimeout(this._checkerTimerId);
        this._checkerTimerId = -1;
    }

    _initDom(message, opts) {
        this._snackbar.$().setHtml(TEMPLATE);
        this._domNode = this._snackbar.$().find(".js-snackbar");

        if (!opts.action) {
            this.$action().remove();
        } else {
            this.$().removeClass("no-action");
            this.$action().setText(`${opts.action}`);
        }

        if (opts.multiLine) {
            this.$title().removeClass(".single-line");
        }
        this.$title().setText(message);
    }

    finished() {
        return new Promise((resolve) => {
            this.once(`hide`, () => {
                resolve(this.outcome);
            });
        });
    }

    replace(message) {
        this.$title().setText(`${message}`);
        this._startedShowing = performance.now();
        return this.finished();
    }

    _mouseEntered() {
        this._clearTimer();
        this._isHovering = true;
    }

    _mouseLeft() {
        this._clearTimer();
        this._startedShowing = performance.now();
        this._isHovering = false;
        this._checkerTimerId = this.page().setTimeout(this._timeoutChecker, this.visibilityTime);
    }

    _timeoutChecker() {
        this._checkerTimerId = -1;
        if (this._exiting) return;
        const {visibilityTime} = this;
        const shownTime = this._startedShowing === -1 ? 0 : performance.now() - this._startedShowing;

        if (!this._snackbar.globalEvents.isWindowBackgrounded() && !this._isHovering) {
            if (shownTime > visibilityTime) {
                this.outcome = TIMED_OUT;
                this._hide();
            } else {
                this._checkerTimerId = this.page().setTimeout(this._timeoutChecker, Math.max(0, visibilityTime - shownTime));
            }
        }
    }

    _visibilityChanged() {
        this._clearTimer();
        this._startedShowing = performance.now();
        this._checkerTimerId = this.page().setTimeout(this._timeoutChecker, this.visibilityTime);
    }

    _clicked(e) {
        const hasBeenActiveMilliseconds = performance.now() - this._initialShowing;
        const dismissable = hasBeenActiveMilliseconds >
                (this._snackbar.initialUndismissableWindow + this._snackbar.nextDelay);


        const action = this.$action();
        if (action && this.page().$(e.target).closest(action).length > 0) {
            this.outcome = ACTION_CLICKED;
        } else if (dismissable) {
            this.outcome = DISMISSED;
        }

        if (this.outcome !== NO_OUTCOME) {
            this._hide();
        }
    }

    async _hide() {
        if (this._exiting) return;
        this._exiting = true;
        this._removeListeners();
        await animationPromisify(this.$().animate([
            {transform: "translateY(0%)"},
            {transform: "translateY(100%)"}
        ], animationOptions));
        await delay(this.outcome !== ACTION_CLICKED ? this._snackbar.nextDelay : 0);
        this.emit(`hide`, this);
        this._destroy();
    }

    _removeListeners() {
        this.$().removeEventListener(`click`, this._clicked);
        this._snackbar.globalEvents.removeListener(`visibilityChange`, this._visibilityChanged);
        this._clearTimer();
    }

    _destroy() {
        this._removeListeners();
        this.$().remove();
    }

    page() {
        return this._snackbar.page;
    }
}

export default class Snackbar extends EventEmitter {
    constructor(opts, deps) {
        super();
        opts = noUndefinedGet(opts);
        this.page = deps.page;
        this.globalEvents = deps.globalEvents;
        this.recognizerContext = deps.recognizerContext;

        this._domNode = this.page.$(opts.target);
        this.nextDelay = opts.nextDelay;
        this.visibilityTime = opts.visibilityTime;
        this.initialUndismissableWindow = opts.initialUndismissableWindow;

        this.maxLength = opts.maxLength || 3;

        this._currentInstance = null;
        this._queue = [];

        this._nextDelayId = -1;
        this._next = this._next.bind(this);
    }

    $() {
        return this._domNode;
    }

    _snackbarWillShow() {
        this.emit(SNACKBAR_WILL_SHOW_EVENT);
        this.$().show("grid");
    }

    _next() {
        this.page.clearTimeout(this._nextDelayId);
        this._nextDelayId = this.page.setTimeout(() => {
            this._currentInstance = null;
            if (this._queue.length > 0) {
                this._currentInstance = this._queue.shift();
                this._currentInstance.show();
            } else {
                this.emit(SNACKBAR_DID_HIDE_EVENT);
                this.$().hide();
            }
        }, this.nextDelay);
    }

    removeByTag(tag) {
        const queue = this._queue;
        for (let i = 0; i < queue.length; ++i) {
            if (queue[i].opts.tag === tag) {
                queue.splice(i, 1);
                i--;
            }
        }

        if (this._currentInstance &&
            !this._currentInstance._exiting &&
            this._currentInstance.tag === tag) {
            this._currentInstance.outcome = DISMISSED;
            this._currentInstance._hide();
        }
    }

    async show(message, opts) {
        const {tag} = opts;

        if (tag && this._currentInstance &&
            tag === this._currentInstance.tag &&
            !this._currentInstance._exiting) {
            this._currentInstance.removeAllListeners(`hide`);
            let outcome;
            try {
                outcome = await this._currentInstance.replace(message);
            } finally {
                this._next();
            }
            return outcome;
        }

        const queue = this._queue;
        try {
            if (this._currentInstance) {
                if (tag && queue.length) {
                    for (let i = 0; i < queue.length; ++i) {
                        if (queue[i].tag === tag) {
                            queue[i].message = message;
                            return queue[i].finished();
                        }
                    }
                }

                if (queue.length >= this.maxLength) {
                    queue.pop();
                }

                const queuedMessage = new SnackbarInstance(this, message, opts);
                queue.push(queuedMessage);
                return await queuedMessage.finished();
            } else {
                this._currentInstance = new SnackbarInstance(this, message, opts);
                this._currentInstance.show();
                return await this._currentInstance.finished();
            }
        } finally {
            this._next();
        }
    }
}
