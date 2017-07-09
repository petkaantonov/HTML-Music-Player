import EventEmitter from "events";
import {delay, noop, noUndefinedGet} from "util";
import {performance} from "platform/platform";

const NO_TAG = {};
export const NO_OUTCOME = -1;
export const ACTION_CLICKED = 0;
export const DISMISSED = 1;
export const TIMED_OUT = 2;

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

        this._actionDom = null;
        this._titleDom = null;
        this._domNode = null;

        this._visibilityChanged = this._visibilityChanged.bind(this);
        this._clicked = this._clicked.bind(this);
        this._timeoutChecker = this._timeoutChecker.bind(this);
        this._mouseEntered = this._mouseEntered.bind(this);
        this._mouseLeft = this._mouseLeft.bind(this);
        this._resized = this._resized.bind(this);
    }

    show() {
        const {message, opts, snackbar} = this;
        this._initDom(message, opts);
        this.$().addEventListener(`click`, this._clicked);
        this.$().addEventListener(`mouseenter`, this._mouseEntered);
        this.$().addEventListener(`mouseleave`, this._mouseLeft);
        this._snackbar.globalEvents.on(`resize`, this._resized);
        this._snackbar.globalEvents.on(`visibilityChange`, this._visibilityChanged);

        snackbar.recognizerContext.createTapRecognizer(this._clicked).recognizeBubbledOn(this.$());
        this._checkerTimerId = this.page().setTimeout(this._timeoutChecker, this.visibilityTime);

        if (this._snackbar.transitionInClass) {
            this.$().addClass([this._snackbar.transitionInClass, `initial`]);
            this.$().setStyle(`willChange`, `transform`);
            this.$().appendTo(`body`);
            this._resized();
            this.$().detach();
            this.$().appendTo(`body`);
            this.$().forceReflow();
            this._snackbar.beforeTransitionIn(this.$());
            this.page().changeDom(() => {
                this.$().removeClass(`initial`);
                this.page().setTimeout(() => {
                    this.$().setStyle(`willChange`, ``);
                }, 500);
            });
        } else {
            this.$().appendTo(`body`);
            this._resized();
        }
    }

    _resized() {
        const box = this.$()[0].getBoundingClientRect();
        const maxWidth = this.page().width();
        this.$().setStyles({
            left: `${Math.max(0, maxWidth - box.width) / 2}px`,
            height: `${box.height}px`
        });
    }

    $() {
        return this._domNode;
    }

    $action() {
        return this._actionDom;
    }

    $title() {
        return this._titleDom;
    }

    _clearTimer() {
        this.page().clearTimeout(this._checkerTimerId);
        this._checkerTimerId = -1;
    }

    _initDom(message, opts) {
        let action = this.page().$();
        if (opts.action) {
            action = this.page().createElement(`div`, {class: this._snackbar.actionClass});

            const actionTextContainer = this.page().createElement(`div`, {
                class: this._snackbar.textContainerClass
            });
            const actionText = this.page().createElement(`div`, {
                class: this._snackbar.textClass
            });

            actionTextContainer.append(actionText);
            actionText.setText(`${opts.action}`).appendTo(actionTextContainer);
            action.append(actionTextContainer);

            this._actionDom = action;
        }

        const title = this.page().createElement(`div`, {
            class: this._snackbar.titleClass
        }).setText(message);

        this._titleDom = title;

        const snackbar = this.page().createElement(`div`, {
            class: this._snackbar.containerClass
        }).append(title).append(action);

        this._domNode = snackbar;
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
        if (this._snackbar.transitionOutClass) {
            this.$().detach();
            if (this._snackbar.transitionInClass) {
                this.$().removeClass([this._snackbar.transitionInClass, `initial`]);
            }
            this.$().setStyle(`willChange`, `transform`);
            this.$().addClass([this._snackbar.transitionOutClass, `initial`]);
            this.$().appendTo(`body`);
            this.$().forceReflow();
            this._snackbar.beforeTransitionOut(this.$());
            this.page().changeDom(() => {
                this.$().removeClass(`initial`);
            });
        }

        await delay(this.outcome !== ACTION_CLICKED ? this._snackbar.nextDelay : 0);
        this.emit(`hide`, this);
        this._destroy();
    }

    _removeListeners() {
        this.$().removeEventListener(`click`, this._clicked);
        this._snackbar.globalEvents.removeListener(`resize`, this._resized);
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

export default function Snackbar(opts, deps) {
    opts = noUndefinedGet(opts);
    this.page = deps.page;
    this.globalEvents = deps.globalEvents;
    this.recognizerContext = deps.recognizerContext;

    this.containerClass = opts.containerClass;
    this.actionClass = opts.actionClass;
    this.titleClass = opts.titleClass;
    this.textContainerClass = opts.textContainerClass;
    this.textClass = opts.textClass;
    this.transitionInClass = opts.transitionInClass;
    this.transitionOutClass = opts.transitionOutClass;
    this.beforeTransitionIn = opts.beforeTransitionIn || noop;
    this.beforeTransitionOut = opts.beforeTransitionOut || noop;
    this.nextDelay = opts.nextDelay;
    this.visibilityTime = opts.visibilityTime;
    this.initialUndismissableWindow = opts.initialUndismissableWindow;

    this.maxLength = opts.maxLength || 3;

    this._currentInstance = null;
    this._queue = [];

    this._nextDelayId = -1;
    this._next = this._next.bind(this);


}

Snackbar.prototype._next = function() {
    this.page.clearTimeout(this._nextDelayId);
    this._nextDelayId = this.page.setTimeout(() => {
        this._currentInstance = null;
        if (this._queue.length > 0) {
            this._currentInstance = this._queue.shift();
            this._currentInstance.show();
        }
    }, this.nextDelay);
};

Snackbar.prototype.removeByTag = function(tag) {
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
};

Snackbar.prototype.show = async function(message, opts) {
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
};
