import EventEmitter from "events";
import {SHUTDOWN_EVENT} from "platform/GlobalEvents";
import {delay} from "util";

const UPDATE_INTERVAL = 15 * 60 * 1000;

export const UPDATE_AVAILABLE_EVENT = `updateAvailable`;

export default class ServiceWorkerManager extends EventEmitter {
    constructor(deps) {
        super();
        this._page = deps.page;
        this._globalEvents = deps.globalEvents;
        this._env = deps.env;
        this._db = deps.db;

        this._registration = null;
        this._started = false;

        this._updateAvailableNotified = false;
        this._lastUpdateChecked = Date.now();
        this._currentUpdateCheck = null;
        this._updateAvailable = this._updateAvailable.bind(this);
        this._updateFound = this._updateFound.bind(this);
        this._messaged = this._messaged.bind(this);
        this._foregrounded = this._foregrounded.bind(this);
        this._backgrounded = this._backgrounded.bind(this);
        this._updateChecker = this._updateChecker.bind(this);
        this._appClosed = this._appClosed.bind(this);

        this._pendingMessages = new Map();
        this._nextPendingMessageId = 0;

        this._updateCheckInterval = this._page.setInterval(this._updateChecker, 10000);
        this._globalEvents.on(`foreground`, this._foregrounded);
        this._globalEvents.on(`background`, this._backgrounded);
        this._globalEvents.on(SHUTDOWN_EVENT, this._appClosed);
    }

    get controller() {
        const sw = this._page.navigator().serviceWorker;
        return sw && sw.controller;
    }

    _appClosed(preferences) {
        const {controller} = this;
        if (controller) {
            try {
                controller.postMessage({
                    action: `savePreferences`,
                    preferences
                });
            } catch (e) {
                // NOOP
            }
        }
    }

    _updateChecker() {
        if (this._registration &&
            Date.now() - this._lastUpdateChecked > UPDATE_INTERVAL &&
            !this._updateAvailableNotified &&
            !this._currentUpdateCheck) {
            this._checkForUpdates();
        }
    }

    _backgrounded() {
        this._page.clearInterval(this._updateCheckInterval);
        this._updateCheckInterval = -1;
    }

    _foregrounded() {
        this._updateCheckInterval = this._page.setInterval(this._updateChecker, 10000);
        this._updateChecker();
    }

    _checkForUpdates() {
        this._lastUpdateChecked = Date.now();
        this._currentUpdateCheck = (async () => {
            try {
                const reg = await this._registration;
                await reg.update();
            } catch (e) {
                // Noop
            } finally {
                this._currentUpdateCheck = null;
            }
        })();
    }

    checkForUpdates() {
        if (this._registration &&
            !this._updateAvailableNotified &&
            this._currentUpdateCheck) {
            this._checkForUpdates();
        }
    }

    async _updateAvailable(worker) {
        this._updateAvailableNotified = true;
        let nextAskTimeout = 15 * 1000;
        while (true) {
            let shouldRefreshPromise;
            try {
                this.emit(UPDATE_AVAILABLE_EVENT, (respondedWith) => {
                    shouldRefreshPromise = respondedWith;
                });
                const shouldRefresh = await shouldRefreshPromise;
                if (shouldRefresh === true) {
                    worker.postMessage({action: `skipWaiting`});
                    return;
                }
            } catch (e) {
                self.uiLog(e.message);
            }

            await delay(nextAskTimeout);
            nextAskTimeout += 10000;
            nextAskTimeout = Math.min(nextAskTimeout, 60 * 1000);
        }
    }

    _updateFound(worker) {
        worker.addEventListener(`statechange`, () => {
            if (worker.state === `installed`) {
                this._updateAvailable(worker);
            }
        });
    }

    start() {
        if (this._started || !this._page.navigator().serviceWorker) return;
        this._started = true;
        this._registration = (async () => {
            try {
                const reg = await this._page.navigator().serviceWorker.register(`/sw.js`);
                if (!this.controller) return reg;

                if (reg.waiting) {
                    this._updateAvailable(reg.waiting);
                } else if (reg.installing) {
                    this._updateFound(reg.installing);
                } else {
                    reg.addEventListener(`updatefound`, () => {
                        this._updateFound(reg.installing);
                    });
                }

                this._page.navigator().serviceWorker.addEventListener(`message`, this._messaged);
                this._page.navigator().serviceWorker.addEventListener(`ServiceWorkerMessageEvent`, this._messaged);
                this._page.addWindowListener(`message`, this._messaged);
                this._page.addWindowListener(`ServiceWorkerMessageEvent`, this._messaged);
                return reg;
            } catch (e) {
                if (!this._env.isDevelopment()) {
                    throw e;
                } else {
                    console.log(e.message);
                }
                return null;
            }
        })();

        let reloading = false;
        this._page.navigator().serviceWorker.addEventListener(`controllerchange`, () => {
            if (reloading) return;
            reloading = true;
            this._page.location().reload();
        });
    }

    async loadPreferences() {
        if (!this._started) {
            this.start();
        }
        await this._registration;
        const preferences = await this._postMessageAndAwaitResponse({
            action: `loadPreferences`
        });

        if (preferences) {
            return preferences;
        } else {
            return this._db.getAll();
        }
    }

    _postMessageAndAwaitResponse(data) {
        return new Promise((resolve, reject) => {
            data.__requestId = ++this._nextPendingMessageId;
            this._pendingMessages.set(data.__requestId, {resolve, reject});
            const {controller} = this;
            if (controller) {
                try {
                    controller.postMessage(data);
                } catch (e) {
                    reject(e);
                }
            } else {
                resolve(null);
            }
        });
    }

    _messaged(e) {
        const {result, error, __requestId} = e.data;
        if (__requestId) {
            const pendingMessage = this._pendingMessages.get(__requestId);
            if (pendingMessage) {
                this._pendingMessages.delete(__requestId);
                if (!error) {
                    pendingMessage.resolve(result);
                } else {
                    pendingMessage.reject(new Error(error.message));
                }
            } else {
                const {type} = e.data;
                const {controller} = this;
                if (!controller) return;
                if (type === `getPreferences`) {
                    const preferenceKeyValuePairs = this._globalEvents.gatherAllPreferences();
                    const preferences = {};
                    for (const keyValuePair of preferenceKeyValuePairs) {
                        preferences[keyValuePair.key] = keyValuePair.value;
                    }
                    controller.postMessage({
                        action: `gotPreferences`,
                        preferences,
                        __requestId
                    });
                }
            }
        }
    }
}
