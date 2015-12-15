var serviceWorkerManager = (function() { "use strict";

var timing = window.performance && window.performance.timing || {};
const TAB_ID = sha1(timing.connectEnd + "" +
                timing.connectStart + "" +
                timing.domComplete + "" +
                timing.domContentLoadedEventEnd + "" +
                timing.domContentLoadedEventStart + "" +
                timing.domInteractive + "" +
                timing.domLoading + "" +
                timing.domainLookupEnd + "" +
                timing.domainLookupStart + "" +
                timing.fetchStart + "" +
                timing.loadEventEnd + "" +
                timing.loadEventStart + "" +
                timing.navigationStart + "" +
                timing.redirectEnd + "" +
                timing.redirectStart + "" +
                timing.requestStart + "" +
                timing.responseEnd + "" +
                timing.responseStart + "" +
                timing.secureConnectionStart + "" +
                timing.unloadEventEnd + "" +
                timing.unloadEventStart + "" +
                Date.now() + "" +
                Math.random());

function ServiceWorkerManager() {
    this._registration = null;
    this._started = false;

    this._updateAvailable = this._updateAvailable.bind(this);
    this._updateFound = this._updateFound.bind(this);
}

ServiceWorkerManager.prototype._updateAvailable = function(worker, nextAskTimeout) {
    var self = this;
    if (!nextAskTimeout) nextAskTimeout = 60 * 1000;
    
    GlobalUi.snackbar.show("New version available", {
        action: "refresh",
        visibilityTime: 15000
    }).then(function(outcome) {
        switch (outcome) {
            case Snackbar.ACTION_CLICKED:
                worker.postMessage({action: 'skipWaiting'});
                return;
            case Snackbar.DISMISSED:
                worker.postMessage({action: 'skipWaiting'});
                return;
            case Snackbar.TIMED_OUT:
                setTimeout(function() {
                    self._updateAvailable(worker, nextAskTimeout * 3);
                }, nextAskTimeout);
            default:
                return;
        }
    }).catch(function(e) {
        return GlobalUi.snackbar.show(e.message);
    });
};

ServiceWorkerManager.prototype._updateFound = function(worker) {
    var self = this;
    worker.addEventListener("statechange", function() {
        if (worker.state === "installed") {
            self._updateAvailable(worker);
        }
    });
};

ServiceWorkerManager.prototype.start = function() {
    if (this._started || !navigator.serviceWorker) return;
    this._started = true;
    var self = this;
    this._registration = navigator.serviceWorker.register("/sw.js").then(function(reg) {
        if (!navigator.serviceWorker.controller) return;

        if (reg.waiting) {
            self._updateAvailable(reg.waiting);
        } else if (reg.installing) {
            self._updateFound(reg.installing);
        } else {
            reg.addEventListener("updatefound", function() {
                self._updateFound(reg.installing);
            });
        }
    });

    var reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", function() {
        if (reloading) return;
        reloading = true;
        $(window).off("beforeunload");
        location.reload();
    });
};

return new ServiceWorkerManager(); })();
