import {delay} from "util";
import {DISMISSED, TIMED_OUT, ACTION_CLICKED} from "ui/Snackbar";
import EventEmitter from "events";
import {SHUTDOWN_EVENT} from "platform/GlobalEvents";

const UPDATE_INTERVAL = 15 * 60 * 1000;
const tabId = Math.floor(Date.now() + Math.random() * Date.now());
const rTagStrip = new RegExp(`\\-${tabId}$`);

let notificationId = (Date.now() * Math.random()) | 0;

export default class ServiceWorkerManager extends EventEmitter {
    constructor(deps) {
        super();
        this._page = deps.page;
        this._globalEvents = deps.globalEvents;
        this._env = deps.env;
        this._snackbar = deps.snackbar;

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

        this._updateCheckInterval = this._page.setInterval(this._updateChecker, 10000);
        this._globalEvents.on(`foreground`, this._foregrounded);
        this._globalEvents.on(`background`, this._backgrounded);
        this._globalEvents.on(SHUTDOWN_EVENT, this._appClosed);
    }

    _appClosed(preferences) {
        if (this._page.navigator().serviceWorker &&
            this._page.navigator().serviceWorker.controller) {
            try {
                this._page.navigator().serviceWorker.controller.postMessage({
                    action: `savePreferences`,
                    tabId,
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
        try {
            let outcome;
            let nextAskTimeout = 60 * 1000;

            do {
                outcome = await this._snackbar.show(`New version available`, {
                    action: `refresh`,
                    visibilityTime: 15000,
                    tag: null
                });

                if (outcome === ACTION_CLICKED || outcome === DISMISSED) {
                    worker.postMessage({action: `skipWaiting`});
                    return;
                }

                await delay(nextAskTimeout);
                nextAskTimeout *= 3;
            } while (outcome === TIMED_OUT);
        } catch (e) {
            await this._snackbar.show(e.message, {
                visibilityTime: 15000,
                tag: null
            });
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
                if (!this._page.navigator().serviceWorker.controller) return reg;

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
                    self.uiLog(e.message);
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

    _messaged(e) {
        if (e.data.data.tabId !== tabId || e.data.eventType !== `swEvent`) return;
        const {data} = e;
        let {tag} = data;

        if (tag) {
            tag = (`${tag}`).replace(rTagStrip, ``);
        } else {
            tag = ``;
        }

        const eventArg = data.data;
        let eventName = null;

        if (data.type === `notificationClick`) {
            eventName = `action${data.action}-${tag}`;
        } else if (data.type === `notificationClose`) {
            eventName = `notificationClose-${tag}`;
        }

        if (eventName) {
            this.emit(eventName, eventArg);
        }
    }

    async hideNotifications(tag) {
        if (tag) {
            tag = `${tag}-${tabId}`;
        } else {
            tag = tabId;
        }
        const reg = await this._registration;
        const notifications = await Promise.resolve(reg.getNotifications({tag}));
        notifications.forEach((notification) => {
            try {
                notification.close();
            } catch (e) {
                // Noop
            }
        });
    }

    async showNotification(title, {tag}) {
        if (!this._started) return null;
        const id = ++notificationId;
        const data = {notificationId: id, tabId};
        const reg = await this._registration;
        const tagOption = (tag ? `${tag}-${tabId}` : `${tabId}`);

        if (this._env.isMobile()) {
            const notifications = await Promise.resolve(reg.getNotifications());
            for (const notification of notifications) {
                try {
                    notification.close();
                } catch (e) {
                    // Noop
                }
            }
        }

        await reg.showNotification(title, {
            data,
            tag: tagOption
        });

        const notifications = await Promise.resolve(reg.getNotifications({tag: tagOption}));
        const otherNotifications = notifications.filter(n => n.data.notificationId !== id && n.data.tabId === tabId);
        for (const notification of otherNotifications) {
            try {
                notification.close();
            } catch (e) {
                // Noop
            }
        }
        return notifications.find(n => n.data.notificationId === id && n.data.tabId === tabId) || null;
    }
}
