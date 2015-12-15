// AUTOMATICALLY GENERATED FILE DO NOT EDIT
const assets = [
    "/",
    "dist/css/app-css-public.css",
    "dist/css/glyphicons.css",
    "dist/fonts/glyphicons-halflings-regular.woff",
    "dist/fonts/glyphicons-halflings-regular.woff2",
    "dist/fonts/icomoon.woff",
    "dist/images/ajaxload.gif",
    "dist/images/app-load.gif",
    "dist/images/body-noise.png",
    "dist/images/icon.png",
    "dist/images/seek_fill_gradient.png",
    "dist/images/volume_slider_bg.png",
    "dist/images/volume_slider_knob.png",
    "dist/main.min.js",
    "https://fonts.googleapis.com/css?family=Droid+Sans:400,700",
    "https://fonts.googleapis.com/icon?family=Material+Icons",
    "index.html",
    "worker/AcoustId.js",
    "worker/ebur128.js",
    "worker/fingerprint.js",
    "worker/loudness.js",
    "worker/worker_api.js"
];
const versionHash = 'dc786adc675d68f02becd5d30fb410dc7348d997188c9c1ff330f99b8577c7cc';
const buildDate = 'Mon, 14 Dec 2015 18:25:28 GMT';

const ASSET_PREFIX = "asset-cache-v";
const ASSET_CACHE = ASSET_PREFIX + versionHash;
const COVER_ART_CACHE = "cover-art-cache";
const COVER_ART_HOSTNAME = "coverartarchive.org";
const THIRD_PARTY_ASSET_CACHE = "asset-cache-3rd-party";
const IS_DEVELOPMENT = location.hostname === "vm";

var delay = function(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
};

self.addEventListener("install", function(e) {
    if (IS_DEVELOPMENT) return;

    var assetsCached = caches.open(ASSET_CACHE).then(function (cache) {
        return Promise.all(assets.map(function loop(url) {
            return (function loop(retries) {
                if (url.indexOf("http") >= 0 || url.indexOf("//") === 0) {
                    return cache.add(url);
                }

                return fetch(url, {
                    credentials: "include",
                    mode: "no-cors"
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

var rfonts = /\.(woff2?)$/
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

    if (!isHttp || (!isCoverArt && (isCorsFont || isQuery))) {
        return;
    }

    // Cache coverart even in development.
    if (IS_DEVELOPMENT && !isCoverArt) {
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
    }
});
