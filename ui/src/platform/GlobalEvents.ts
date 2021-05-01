import { PreferenceArray } from "shared/preferences";
import { EventEmitterInterface } from "shared/types/helpers";
import { throttle } from "shared/util";
import Page, { isTextInputElement } from "ui/platform/dom/Page";
import { PlayedTrackOrigin } from "ui/tracks/TrackContainerController";
import EventEmitter from "vendor/events";

export default class GlobalEvents extends EventEmitter {
    private _page: Page;
    private _blurred?: boolean;
    private _fireSizeChangeEvents: boolean;
    private _pendingSizeChange: boolean;
    private _history: History;
    private _lastShownPlayedTrackOrigin: PlayedTrackOrigin | null;
    private _shutdownEmitted: boolean;

    constructor(page: Page) {
        super();
        this.setMaxListeners(99999999);
        this._page = page;
        this._blurred = undefined;
        this._fireSizeChangeEvents = true;
        this._pendingSizeChange = false;
        this._history = page.window().history;
        this._lastShownPlayedTrackOrigin = null;
        this._shutdownEmitted = false;

        this._page.onDocumentVisibilityChange(this._windowVisibilityChanged.bind(this));

        this._page.addDocumentListener(`focus`, this._elementFocused, { capture: true });
        this._page.addDocumentListener(`blur`, this._elementBlurred, { capture: true });
        this._page.addWindowListener(`blur`, this._windowBlurred);
        this._page.addWindowListener(`focus`, this._windowFocused);
        this._page.addWindowListener(`resize`, this._triggerSizeChange, { capture: true });
        this._page.addWindowListener(`unload`, this._beforeUnload);
        this._page.addWindowListener(`beforeunload`, this._beforeUnload);
        this._page.addWindowListener(`popstate`, this._historyStatePopped);

        this._history.scrollRestoration = `manual`;
        this._ensureHistoryState();
    }

    _historyStatePopped = () => {
        this.emit(`backbuttonPress`);
        this._ensureHistoryState();
    };

    _ensureHistoryState() {
        const currentState = this._history.state;
        if (!currentState || (currentState && currentState.app !== `soita`)) {
            this._history.pushState({ app: `soita` }, ``);
        }
    }

    _windowBlurred = () => {
        this._blurred = true;
        this.emit(`visibilityChange`);
    };

    _windowFocused = () => {
        this._blurred = false;
        this.emit(`visibilityChange`);
    };

    _windowVisibilityChanged = () => {
        if (this.isWindowBackgrounded()) {
            this.emit(`background`);
        } else {
            this.emit("foreground");
        }
        this.emit(`visibilityChange`);
    };

    _fireLongPressStart(t: Touch) {
        this.emit(`longPressStart`, t);
    }

    _fireLongPressEnd(t: Touch) {
        this.emit(`longPressEnd`, t);
    }

    _fireClear() {
        this.emit(`clear`);
    }

    _triggerSizeChange = () => {
        if (!this._fireSizeChangeEvents) {
            return;
        }

        const activeElement = this._page.activeElement();
        if (activeElement && isTextInputElement(activeElement)) {
            this._pendingSizeChange = true;
            return;
        }
        this.emit(`resize`);
    };

    _resetFireSizeChangeEvents = () => {
        this._fireSizeChangeEvents = true;
    };

    _elementFocused = (e: FocusEvent) => {
        if (isTextInputElement(e.target as HTMLElement)) {
            this._fireSizeChangeEvents = false;
            this._resetFireSizeChangeEvents();
        }
    };

    _elementBlurred = (e: FocusEvent) => {
        if (isTextInputElement(e.target as HTMLElement)) {
            this._page.window().scrollTo(0, 0);
            if (this._pendingSizeChange) {
                this._pendingSizeChange = false;
                this._firePendingSizeChangeEvent();
            }
        }
    };

    _shutdown = () => {
        if (this._shutdownEmitted) return;
        this._shutdownEmitted = true;
        this.emit("shutdown", this.gatherAllPreferences());
    };

    _beforeUnload = () => {
        this._shutdown();
    };

    gatherAllPreferences() {
        const preferencesToSave: PreferenceArray = [];
        this.emit("shutdownSavePreferences", preferencesToSave);
        return preferencesToSave;
    }

    isWindowBlurred() {
        if (this._blurred === undefined) return this.isWindowBackgrounded();
        if (this._blurred === true) return true;
        return this.isWindowBackgrounded();
    }

    isWindowBackgrounded() {
        return this._page.isDocumentHidden();
    }

    windowWasForegrounded = () => {
        return new Promise<void>(resolve => {
            this.once("foreground", resolve);
        });
    };

    setLastShownPlayedTrackOrigin(origin: PlayedTrackOrigin) {
        this._lastShownPlayedTrackOrigin = origin;
    }

    getLastShownPlayedTrackOrigin() {
        return this._lastShownPlayedTrackOrigin;
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    _firePendingSizeChangeEvent() {}
}

GlobalEvents.prototype._firePendingSizeChangeEvent = throttle(GlobalEvents.prototype._triggerSizeChange, 100);
GlobalEvents.prototype._resetFireSizeChangeEvents = throttle(GlobalEvents.prototype._resetFireSizeChangeEvents, 500);

export default interface GlobalEvents
    extends EventEmitterInterface<{
        foreground: () => void;
        shutdownSavePreferences: (p: PreferenceArray) => void;
        shutdown: (p: PreferenceArray) => void;
        resize: () => void;
        clear: () => void;
        longPressStart: (t: Touch) => void;
        longPressEnd: (t: Touch) => void;
        background: () => void;
        visibilityChange: () => void;
        backbuttonPress: () => void;
    }> {}
