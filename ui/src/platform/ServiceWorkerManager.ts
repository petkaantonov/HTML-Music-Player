import KeyValueDatabase from "shared/idb/KeyValueDatabase";
import { PreferenceArray } from "shared/preferences";
import { EventEmitterInterface } from "shared/types/helpers";
import { delay } from "shared/util";
import GlobalEvents from "ui/platform/GlobalEvents";
import EventEmitter from "vendor/events";

import Page from "./dom/Page";
import Env from "./Env";

const UPDATE_INTERVAL = 15 * 60 * 1000;

export default interface ServiceWorkerManager
    extends EventEmitterInterface<{
        updateAvailable: (handler: (respondedWith: Promise<boolean>) => void) => void;
    }> {}

export default class ServiceWorkerManager extends EventEmitter {
    private _page: Page;
    private _globalEvents: GlobalEvents;
    private _env: Env;
    private _db: KeyValueDatabase;

    private _registration: null | Promise<ServiceWorkerRegistration | null>;
    private _started: boolean;
    private _updateAvailableNotified: boolean;
    private _lastUpdateChecked: number;
    private _currentUpdateCheck: null | Promise<void>;
    private _preferencesSaved: boolean;
    private _updateCheckInterval: number;

    constructor(deps: { page: Page; globalEvents: GlobalEvents; env: Env; db: KeyValueDatabase }) {
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

        this._preferencesSaved = false;

        this._updateCheckInterval = this._page.setInterval(this._updateChecker, 10000);
        this._globalEvents.on(`foreground`, this._foregrounded);
        this._globalEvents.on(`background`, this._backgrounded);
        this._globalEvents.on("shutdown", this._appClosed);
    }

    get controller() {
        const sw = this._page.navigator().serviceWorker;
        return sw && sw.controller;
    }

    _canSavePreferences() {
        return !!this.controller && !this._preferencesSaved;
    }

    _savePreferences(preferences: PreferenceArray) {
        const { controller } = this;
        if (this._canSavePreferences()) {
            this._preferencesSaved = true;
            try {
                controller!.postMessage({
                    action: `savePreferences`,
                    preferences,
                });
            } catch (e) {
                // NOOP
            }
        }
    }

    _appClosed = (preferences: PreferenceArray) => {
        this._savePreferences(preferences);
    };

    _updateChecker = () => {
        if (
            this._registration &&
            Date.now() - this._lastUpdateChecked > UPDATE_INTERVAL &&
            !this._updateAvailableNotified &&
            !this._currentUpdateCheck
        ) {
            this._checkForUpdates();
        }
    };

    _backgrounded = () => {
        this._page.clearInterval(this._updateCheckInterval);
        this._updateCheckInterval = -1;
    };

    _foregrounded = () => {
        this._updateCheckInterval = this._page.setInterval(this._updateChecker, 10000);
        this._updateChecker();
    };

    _checkForUpdates() {
        this._lastUpdateChecked = Date.now();
        this._currentUpdateCheck = (async () => {
            try {
                const reg = await this._registration;
                await reg!.update();
            } catch (e) {
                // Noop
            } finally {
                this._currentUpdateCheck = null;
            }
        })();
    }

    checkForUpdates() {
        if (this._registration && !this._updateAvailableNotified && this._currentUpdateCheck) {
            this._checkForUpdates();
        }
    }

    _updateAvailable = async (worker: ServiceWorker) => {
        this._updateAvailableNotified = true;
        let nextAskTimeout = 15 * 1000;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            let shouldRefreshPromise: Promise<boolean> | undefined;
            try {
                this.emit("updateAvailable", respondedWith => {
                    shouldRefreshPromise = respondedWith;
                });
                const shouldRefresh = await shouldRefreshPromise;
                if (shouldRefresh === true) {
                    worker.postMessage({ action: `skipWaiting` });
                    return;
                }
            } catch (e) {
                uiLog(e.message);
            }

            await delay(nextAskTimeout);
            nextAskTimeout += 10000;
            nextAskTimeout = Math.min(nextAskTimeout, 60 * 1000);
        }
    };

    _updateFound = (worker: ServiceWorker) => {
        worker.addEventListener(`statechange`, () => {
            if (worker.state === `installed`) {
                void this._updateAvailable(worker);
            }
        });
    };

    start() {
        if (this._started || !this._page.navigator().serviceWorker) return;
        this._started = true;

        this._registration = (async () => {
            try {
                const reg = await this._page.navigator().serviceWorker.register(process.env.SERVICE_WORKER_PATH!);
                if (!this.controller) return reg;

                if (reg.waiting) {
                    void this._updateAvailable(reg.waiting);
                } else if (reg.installing) {
                    this._updateFound(reg.installing);
                } else {
                    reg.addEventListener(`updatefound`, () => {
                        void this._updateFound(reg!.installing!);
                    });
                }
                return reg;
            } catch (e) {
                if (!this._env.isDevelopment()) {
                    throw e;
                } else {
                    self.console.log(e.message);
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

    loadPreferences() {
        if (!this._started) {
            this.start();
        }
        return this._db.getAll();
    }
}
