import {isTextInputElement} from "platform/dom/Page";
import EventEmitter from "events";
import {throttle} from "util";

export const FOREGROUND_EVENT = `foreground`;

export default class GlobalEvents extends EventEmitter {
    constructor(page) {
        super();
        this.setMaxListeners(99999999);
        this._page = page;
        this._blurred = undefined;
        this._fireSizeChangeEvents = true;
        this._pendingSizeChange = false;
        this._beforeUnloadListener = null;
        this._history = page.window().history;

        this._triggerSizeChange = this._triggerSizeChange.bind(this);
        this._firePendingSizeChangeEvent = this._firePendingSizeChangeEvent.bind(this);
        this._resetFireSizeChangeEvents = this._resetFireSizeChangeEvents.bind(this);
        this._elementFocused = this._elementFocused.bind(this);
        this._elementBlurred = this._elementBlurred.bind(this);

        this._page.onDocumentVisibilityChange(this._windowVisibilityChanged.bind(this));

        this._page.addDocumentListener(`focus`, this._elementFocused, true);
        this._page.addDocumentListener(`blur`, this._elementBlurred, true);
        this._page.addWindowListener(`blur`, this._windowBlurred.bind(this));
        this._page.addWindowListener(`focus`, this._windowFocused.bind(this));
        this._page.addWindowListener(`resize`, this._triggerSizeChange, true);
        this._page.addWindowListener(`unload`, this.emit.bind(this, `shutdown`));
        this._page.addWindowListener(`beforeunload`, this._beforeUnload.bind(this));
        this._page.addWindowListener(`popstate`, this._historyStatePopped.bind(this));

        this._history.scrollRestoration = `manual`;
        this._ensureHistoryState();

    }

    _historyStatePopped() {
        this.emit(`backbuttonPress`);
        this._ensureHistoryState();
    }

    _ensureHistoryState() {
        const currentState = this._history.state;
        if (!currentState || (currentState && currentState.app !== `soita`)) {
            this._history.pushState({app: `soita`}, ``);
        }
    }

    _windowBlurred() {
        this._blurred = true;
        this.emit(`visibilityChange`);
    }

    _windowFocused() {
        this._blurred = false;
        this.emit(`visibilityChange`);
    }

    _windowVisibilityChanged() {
        if (this.isWindowBackgrounded()) {
            this.emit(`background`);
        } else {
            this.emit(FOREGROUND_EVENT);
        }
        this.emit(`visibilityChange`);
    }

    _fireLongPressStart(t) {
        this.emit(`longPressStart`, t);
    }

    _fireLongPressEnd(t) {
        this.emit(`longPressEnd`, t);
    }

    _fireClear() {
        this.emit(`clear`);
    }

    _triggerSizeChange() {
        if (!this._fireSizeChangeEvents) {
            return;
        }

        const activeElement = this._page.activeElement();
        if (activeElement && isTextInputElement(activeElement)) {
            this._pendingSizeChange = true;
            return;
        }
        this.emit(`resize`);
    }

    _resetFireSizeChangeEvents() {
        this._fireSizeChangeEvents = true;
    }

    _elementFocused(e) {
        if (isTextInputElement(e.target)) {
            this._fireSizeChangeEvents = false;
            this._resetFireSizeChangeEvents();
        }
    }

    _elementBlurred(e) {
        if (isTextInputElement(e.target)) {
            this._page.window().scrollTo(0, 0);
            if (this._pendingSizeChange) {
                this._pendingSizeChange = false;
                this._firePendingSizeChangeEvent();
            }
        }
    }

    disableBeforeUnloadHandler() {
        this._beforeUnloadListener = null;
    }

    addBeforeUnloadListener(fn) {
        this._beforeUnloadListener = fn;
    }

    _beforeUnload(e) {
        if (this._beforeUnloadListener) {
            const ret = this._beforeUnloadListener(e);
            if (ret) {
                e.returnValue = ret;
                return ret;
            }
        }
        return null;
    }

    isWindowBlurred() {
        if (this._blurred === undefined) return this.isWindowBackgrounded();
        if (this._blurred === true) return true;
        return this.isWindowBackgrounded();
    }

    isWindowBackgrounded() {
        return this._page.isDocumentHidden();
    }

    windowWasForegrounded() {
        return new Promise((resolve) => {
            this.once(FOREGROUND_EVENT, resolve);
        });
    }
}

GlobalEvents.prototype._firePendingSizeChangeEvent = throttle(GlobalEvents.prototype._triggerSizeChange, 100);
GlobalEvents.prototype._resetFireSizeChangeEvents = throttle(GlobalEvents.prototype._resetFireSizeChangeEvents, 500);

