
const ASSET_PREFIX = "asset-cache-v";
const ASSET_CACHE = ASSET_PREFIX + versionHash;
const COVER_ART_CACHE = "cover-art-cache";
const COVER_ART_HOSTNAME = "coverartarchive.org";
const THIRD_PARTY_ASSET_CACHE = "asset-cache-3rd-party";
const IS_DEVELOPMENT = location.hostname === "vm";

const delay = function(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
};

const isCors = function(url) {
    return new URL(url).origin !== location.origin;
};

const ricon = /(?:android-chrome|icon|safari-pinned|mstile)/;
const isUnnecessary = function(url) {
    return url.indexOf("dist/images") >= 0 &&
           ricon.test(url) &&
           url.indexOf("apple-touch-icon-180x180") === -1;
};

self.addEventListener("install", function(e) {
    if (IS_DEVELOPMENT) return;

    var assetsCached = caches.open(ASSET_CACHE).then(function (cache) {
        return Promise.all(assets.map(function loop(url) {
            url = new URL(url, location.origin + (location.pathname || "")).toString();

            if (isCors(url)) {
                return cache.add(url);
            }

            if (isUnnecessary(url)) {
                return Promise.resolve();
            }

            return (function loop(retries) {
                return fetch(url, {
                    credentials: "include",
                    mode: "no-cors",
                    cache: "reload"
                }).then(function(response) {
                    if (response.status != 200) {
                        throw new Error("http");
                    }
                    return cache.put(url, response);
                }).catch(function(e) {
                    if (retries <= 5) {
                        return delay(1000).then(function() {
                            return loop(url, retries + 1);
                        });
                    } else {
                        throw e;
                    }
                });
            })(0);
        }));
    });
    e.waitUntil(assetsCached);
}, false);

self.addEventListener("activate", function(e) {
    var oldAssetsRemoved = caches.keys().then(function(keys) {
        return Promise.all(keys.filter(function(key) {
            // Never delete cover art.
            if (key === COVER_ART_CACHE) {
                return false;
            // Delete everything in development
            } else if (IS_DEVELOPMENT) {
                return true;
            // In production, only delete old assets.
            } else if (key !== ASSET_CACHE && key.indexOf(ASSET_PREFIX) >= 0) {
                return true;
            } else {
                return false;
            }
        }).map(function(key) {
            return caches.delete(key);
        }));
    });
    e.waitUntil(oldAssetsRemoved);
}, false);

var rfonts = /\.(woff2?)$/;
var rswjs = /sw\.js$/;
self.addEventListener("fetch", function(e) {
    var request = e.request;

    if (request.method !== "GET") {
        return;
    }

    var requestURL = new URL(e.request.url);
    var isCors = location.origin !== requestURL.origin;
    var isHttp = requestURL.protocol.toLowerCase().indexOf("http") >= 0;
    var isCoverArt = COVER_ART_HOSTNAME === requestURL.hostname;
    var isQuery = requestURL.search && requestURL.search.length > 1 && isCors;
    var isCorsFont = isCors && rfonts.test(request.url);

    if ((!isHttp || (!isCoverArt && (isCorsFont || isQuery))) ||
        (IS_DEVELOPMENT && !isCoverArt) ||
        (rswjs.test(requestURL.pathname))) {
        return;
    }

    var result = caches.match(e.request).then(function(response) {
        if (response) return response;

        var fetchRequest = e.request.clone();
        return fetch(fetchRequest, {mode: "no-cors"}).then(function(response) {
            var cacheName = null;
            if (!IS_DEVELOPMENT && response.type === "basic" && response.status < 300) {
                cacheName = ASSET_CACHE;
            } else if (COVER_ART_HOSTNAME === requestURL.hostname) {
                cacheName = COVER_ART_CACHE;
            }

            if (cacheName) {
                var responseToCache = response.clone();
                caches.open(cacheName).then(function(cache) {
                    cache.put(fetchRequest, responseToCache)
                });
            }
            return response;
        }).catch(function(e) {
            console.log(e.message);
        });
    });

    e.respondWith(result);
}, false);

self.addEventListener('message', function(e) {
    if (e.data.action === 'skipWaiting') {
        self.skipWaiting();
    } else if (e.data.action === "closeNotifications") {
        var tabId = e.data.tabId;
        if (self.registration && self.registration.getNotifications) {
            self.registration.getNotifications().then(function(notifications) {
                notifications.filter(function(notification) {
                    return notification.data.tabId === tabId;
                }).forEach(function(notification) {
                    try {
                        notification.close();
                    } catch (e) {}
                });
            });
        }
    }
});

self.addEventListener("notificationclick", function(event) {
    event.waitUntil(clients.matchAll({type: "window"}).then(function(clientList) {
        for (var i = 0; i < clientList.length; i++) {
            var client = clientList[i];
            try {
                return client.postMessage({
                    eventType: "swEvent",
                    type: "notificationClick",
                    action: event.action,
                    data: event.notification.data,
                    tag: event.notification.tag
                });
            } catch (e) {}
        }
    }));
});
