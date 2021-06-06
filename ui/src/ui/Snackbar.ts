import * as io from "io-ts";
import { DECELERATE_CUBIC } from "shared/src/easing";
import { EventEmitterInterface } from "shared/types/helpers";
import { animationPromisify, delay } from "shared/util";
import { SelectDeps } from "ui/Application";
import Page, { DomWrapper, DomWrapperSelector } from "ui/platform/dom/Page";
import GlobalEvents from "ui/platform/GlobalEvents";
import EventEmitter from "vendor/events";

import GestureObject from "./gestures/GestureObject";

export const NO_OUTCOME = io.literal(-1);
export const ACTION_CLICKED = io.literal(0);
export const DISMISSED = io.literal(1);
export const TIMED_OUT = io.literal(2);
export const OutcomeType = io.union([NO_OUTCOME, ACTION_CLICKED, DISMISSED, TIMED_OUT]);
export type OutcomeType = io.TypeOf<typeof OutcomeType>;

import GestureRecognizerContext from "./gestures/GestureRecognizerContext";

const DURATION = 470;

const animationOptions: KeyframeAnimationOptions = {
    duration: DURATION,
    easing: DECELERATE_CUBIC,
    fill: `both`,
    composite: "replace",
};

const NO_TAG = {};
export const SNACKBAR_HEIGHT = 48;

const TEMPLATE = `
    <div class="js-snackbar snackbar no-action">
        <div class="snackbar-title single-line js-snackbar-title">hello</div>
        <div class="snackbar-action js-snackbar-action"></div
    </div>
`;

interface SnackbarOpts {
    tag?: string;
    visibilityTime?: number;
    action?: string;
    multiLine?: boolean;
}

interface SnackbarInstanceEventsMap {
    hide: (i: SnackbarInstance) => void;
    show: () => void;
}

interface SnackbarInstance extends EventEmitterInterface<SnackbarInstanceEventsMap> {}

class SnackbarInstance extends EventEmitter {
    outcome: OutcomeType;
    tag: string | typeof NO_TAG;
    message: string;
    opts: SnackbarOpts;
    snackbar: Snackbar;
    visibilityTime: number;
    _exiting: boolean;
    _visible: boolean;
    _snackbar: Snackbar;
    _startedShowing: number;
    _initialShowing: number;
    _isHovering: boolean;
    _domNode: null | DomWrapper;
    _checkerTimerId: number;

    constructor(snackbar: Snackbar, message: string, opts: SnackbarOpts) {
        super();
        opts = Object(opts);
        this.outcome = NO_OUTCOME.value;
        this.tag = opts.tag || NO_TAG;
        this.message = message;
        this.opts = opts;
        this.snackbar = snackbar;
        this.visibilityTime = opts.visibilityTime || snackbar.visibilityTime || 5000;

        this._exiting = false;
        this._visible = !snackbar.globalEvents.isWindowBackgrounded();
        this._snackbar = snackbar;
        this._startedShowing = this._visible ? performance.now() : -1;
        this._checkerTimerId = -1;
        this._initialShowing = performance.now();
        this._isHovering = false;
        this._domNode = null;
    }

    show() {
        this.snackbar._snackbarWillShow();
        const { message, opts, snackbar } = this;
        this._initDom(message, opts);
        this.$().addEventListener(`click`, this._clicked);
        this.$().addEventListener(`mouseenter`, this._mouseEntered);
        this.$().addEventListener(`mouseleave`, this._mouseLeft);
        this._snackbar.globalEvents.on(`visibilityChange`, this._visibilityChanged);

        snackbar.recognizerContext.createTapRecognizer(this._clicked).recognizeBubbledOn(this.$());
        this._checkerTimerId = this.page().setTimeout(this._timeoutChecker, this.visibilityTime);
        this.$().animate([{ transform: `translateY(100%)` }, { transform: `translateY(0%)` }], animationOptions);
    }

    $() {
        return this._domNode!;
    }

    $action() {
        return this.$().find(`.js-snackbar-action`);
    }

    $title() {
        return this.$().find(`.js-snackbar-title`);
    }

    _clearTimer() {
        this.page().clearTimeout(this._checkerTimerId);
        this._checkerTimerId = -1;
    }

    _initDom(message: string, opts: SnackbarOpts) {
        this._snackbar.$().setHtml(TEMPLATE);
        this._domNode = this._snackbar.$().find(`.js-snackbar`);

        if (!opts.action) {
            this.$action().remove();
        } else {
            this.$().removeClass(`no-action`);
            this.$action().setText(`${opts.action}`);
        }

        if (opts.multiLine) {
            this.$title().removeClass(`.single-line`);
        }
        this.$title().setText(message);
    }

    finished(): Promise<OutcomeType> {
        return new Promise(resolve => {
            this.once(`hide`, () => {
                resolve(this.outcome);
            });
        });
    }

    replace(message: string) {
        this.$title().setText(`${message}`);
        this._startedShowing = performance.now();
        return this.finished();
    }

    _mouseEntered = () => {
        this._clearTimer();
        this._isHovering = true;
    };

    _mouseLeft = () => {
        this._clearTimer();
        this._startedShowing = performance.now();
        this._isHovering = false;
        this._checkerTimerId = this.page().setTimeout(this._timeoutChecker, this.visibilityTime);
    };

    _timeoutChecker = () => {
        this._checkerTimerId = -1;
        if (this._exiting) return;
        const { visibilityTime } = this;
        const shownTime = this._startedShowing === -1 ? 0 : performance.now() - this._startedShowing;

        if (!this._snackbar.globalEvents.isWindowBackgrounded() && !this._isHovering) {
            if (shownTime > visibilityTime) {
                this.outcome = TIMED_OUT.value;
                void this._hide();
            } else {
                this._checkerTimerId = this.page().setTimeout(
                    this._timeoutChecker,
                    Math.max(0, visibilityTime - shownTime)
                );
            }
        }
    };

    _visibilityChanged = () => {
        this._clearTimer();
        this._startedShowing = performance.now();
        this._checkerTimerId = this.page().setTimeout(this._timeoutChecker, this.visibilityTime);
    };

    _clicked = (e: MouseEvent | GestureObject) => {
        const target = e.target as HTMLElement;
        const hasBeenActiveMilliseconds = performance.now() - this._initialShowing;
        const dismissable =
            hasBeenActiveMilliseconds > this._snackbar.initialUndismissableWindow + this._snackbar.nextDelay;

        const action = this.$action();
        if (action && this.page().$(target).closest(action).length > 0) {
            this.outcome = ACTION_CLICKED.value;
        } else if (dismissable) {
            this.outcome = DISMISSED.value;
        }

        if (this.outcome !== NO_OUTCOME.value) {
            void this._hide();
        }
    };

    async _hide() {
        if (this._exiting) return;
        this._exiting = true;
        this._removeListeners();
        await animationPromisify(
            this.$().animate([{ transform: `translateY(0%)` }, { transform: `translateY(100%)` }], animationOptions)
        );
        await delay(this.outcome !== ACTION_CLICKED.value ? this._snackbar.nextDelay : 0);
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

interface SnackbarEventsMap {
    snackbarWillShow: () => void;
    snackbarDidHide: () => void;
}

export default interface Snackbar extends EventEmitterInterface<SnackbarEventsMap> {}

type Deps = SelectDeps<"page" | "globalEvents" | "recognizerContext">;

interface Opts {
    target: DomWrapperSelector;
    nextDelay: number;
    visibilityTime: number;
    initialUndismissableWindow: number;
    maxLength: number;
}

export default class Snackbar extends EventEmitter {
    page: Page;
    globalEvents: GlobalEvents;
    recognizerContext: GestureRecognizerContext;
    private _domNode: DomWrapper;
    nextDelay: number;
    visibilityTime: number;
    initialUndismissableWindow: number;
    maxLength: number;
    private _currentInstance: null | SnackbarInstance;
    private _nextDelayId: number;
    private _queue: SnackbarInstance[];

    constructor(opts: Opts, deps: Deps) {
        super();
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
    }

    $() {
        return this._domNode;
    }

    _snackbarWillShow() {
        this.emit("snackbarWillShow");
        this.$().show(`grid`);
    }

    _next = () => {
        this.page.clearTimeout(this._nextDelayId);
        this._nextDelayId = this.page.setTimeout(() => {
            this._currentInstance = null;
            if (this._queue.length > 0) {
                this._currentInstance = this._queue.shift()!;
                this._currentInstance.show();
            } else {
                this.emit("snackbarDidHide");
                this.$().hide();
            }
        }, this.nextDelay);
    };

    removeByTag(tag: string) {
        const queue = this._queue;
        for (let i = 0; i < queue.length; ++i) {
            if (queue[i]!.opts.tag === tag) {
                queue.splice(i, 1);
                i--;
            }
        }

        if (this._currentInstance && !this._currentInstance._exiting && this._currentInstance.tag === tag) {
            this._currentInstance.outcome = DISMISSED.value;
            void this._currentInstance._hide();
        }
    }

    async show(message: string, opts: SnackbarOpts = {}): Promise<OutcomeType> {
        const { tag } = opts;

        if (tag && this._currentInstance && tag === this._currentInstance.tag && !this._currentInstance._exiting) {
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
                        if (queue[i]!.tag === tag) {
                            queue[i]!.message = message;
                            return queue[i]!.finished();
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
