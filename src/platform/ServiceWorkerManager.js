import {inherits, delay} from "util";
import {DISMISSED, TIMED_OUT, ACTION_CLICKED} from "ui/Snackbar";
import EventEmitter from "events";

const UPDATE_INTERVAL = 15 * 60 * 1000;
const tabId = Math.floor(Date.now() + Math.random() * Date.now());

export default function ServiceWorkerManager(deps) {
    EventEmitter.call(this);
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
    this._globalEvents.on(`shutdown`, this._appClosed);

}
inherits(ServiceWorkerManager, EventEmitter);

ServiceWorkerManager.prototype._appClosed = function() {
    if (this._page.navigator().serviceWorker &&
        this._page.navigator().serviceWorker.controller) {
        try {
            this._page.navigator().serviceWorker.controller.postMessage({
                action: `closeNotifications`,
                tabId
            });
        } catch (e) {
            // NOOP
        }
    }
};

ServiceWorkerManager.prototype._updateChecker = function() {
    if (this._registration &&
        Date.now() - this._lastUpdateChecked > UPDATE_INTERVAL &&
        !this._updateAvailableNotified &&
        !this._currentUpdateCheck) {
        this._checkForUpdates();
    }
};

ServiceWorkerManager.prototype._backgrounded = function() {
    this._page.clearInterval(this._updateCheckInterval);
    this._updateCheckInterval = -1;
};

ServiceWorkerManager.prototype._foregrounded = function() {
    this._updateCheckInterval = this._page.setInterval(this._updateChecker, 10000);
    this._updateChecker();
};

ServiceWorkerManager.prototype._checkForUpdates = function() {
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
};

ServiceWorkerManager.prototype.checkForUpdates = function() {
    if (this._registration &&
        !this._updateAvailableNotified &&
        this._currentUpdateCheck) {
        this._checkForUpdates();
    }
};

ServiceWorkerManager.prototype._updateAvailable = async function(worker) {
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
};

ServiceWorkerManager.prototype._updateFound = function(worker) {
    worker.addEventListener(`statechange`, () => {
        if (worker.state === `installed`) {
            this._updateAvailable(worker);
        }
    });
};

ServiceWorkerManager.prototype.start = function() {
    if (this._started || !this._page.navigator().serviceWorker) return;
    this._started = true;
    this._registration = (async () => {
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
    })();

    let reloading = false;
    this._page.navigator().serviceWorker.addEventListener(`controllerchange`, () => {
        if (reloading) return;
        reloading = true;
        this._globalEvents.disableBeforeUnloadHandler();
        this._page.location().reload();
    });
};

const rTagStrip = new RegExp(`\\-${tabId}$`);
ServiceWorkerManager.prototype._messaged = function(e) {
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
};

ServiceWorkerManager.prototype.hideNotifications = async function(tag) {
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
};

let notificationId = (Date.now() * Math.random()) | 0;
ServiceWorkerManager.prototype.showNotification = async function(title, {tag}) {
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
};
