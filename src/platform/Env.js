import {AudioContext, indexedDB, File, Blob, URL, Worker, Uint8Array, crypto, console} from "platform/platform";
import parser from "ua-parser-js";

const MOBILE_WIDTH_THRESHOLD = 768;
const MOBILE_HEIGHT_THRESHOLD = 768;

export default class Env {
    constructor(page) {
        this._page = page;
        page._setEnv(this);
        const document = page.document();
        const navigator = page.navigator();
        const window = page.window();

        const input = document.createElement(`input`);
        const desktopOs = /^(CentOS|Fedora|FreeBSD|Debian|Gentoo|GNU|Linux|Mac OS|Minix|Mint|NetBSD|OpenBSD|PCLinuxOS|RedHat|Solaris|SUSE|Ubuntu|UNIX VectorLinux|Windows)$/;
        const ua = parser(navigator.userAgent);
        let isDesktop = false;

        if (ua.device && ua.device.type) {
            isDesktop = !/^(console|mobile|tablet|smarttv|wearable|embedded)$/.test(ua.device.type);
        } else if (ua.cpu && ua.cpu.architecture) {
            isDesktop = /^(amd64|ia32|ia64)$/.test(ua.cpu.architecture);
        } else if (ua.os && ua.os.name) {
            isDesktop = desktopOs.test(ua.os.name);
        }
        this._isDesktop = isDesktop;
        this._touch = ((`ontouchstart` in window) ||
            navigator.maxTouchPoints > 0 ||
            navigator.msMaxTouchPoints > 0 ||
            (window.DocumentTouch && (document instanceof window.DocumentTouch)));

        this._directories = (`webkitdirectory` in input ||
                            `directory` in input ||
                            `mozdirectory` in input);
        this._readFiles = typeof window.FileReader === `function`;

        this._supportedMimes = `audio/mp3,audio/mpeg`.split(`,`);
        this._rSupportedMimes = new RegExp(`^(?:${this._supportedMimes.join(`|`)})$`, `i`);
        this._rSupportedExtensions = /^(?:mp3|mpg|mpeg)$/i;
        this._mediaSession = `mediaSession` in navigator;

        let browserName, browserVersion;
        let isIe = false;
        if (ua.browser) {
            browserName = (ua.browser.name || ``).toLowerCase();
            browserVersion = +(ua.browser.major || 0);
        }

        if (ua.engine && ua.engine.name && ua.engine.name.toLowerCase().indexOf(`trident`) >= 0) {
            isIe = true;
        }

        this._isIe = isIe;
        this._isSafari = browserName === `safari`;
        this._browserName = browserName;
        this._browserVersion = browserVersion;
        this._retChecked = false;
        this._isDevelopment = window.DEBUGGING === true;

        this._maxNotificationActions = 0;

        if (typeof window.Notification === `function` &&
            typeof window.Notification.maxActions === `number` &&
            typeof navigator.serviceWorker !== `undefined`) {
            this._maxNotificationActions = window.Notification.maxActions;
        }
    }

    warn(...args) {
        if (this.isDevelopment()) {
            console.warn(...args);
        }
    }

    mediaSessionSupport() {
        return this._mediaSession;
    }

    maxNotificationActions() {
        return this._maxNotificationActions;
    }

    isDevelopment() {
        return this._isDevelopment;
    }

    isProduction() {
        return !this._isDevelopment;
    }

    hasTouch() {
        return this._touch;
    }

    isDesktop() {
        return this._isDesktop;
    }

    isMobile() {
        return !this._isDesktop;
    }

    isMobileScreenSize(specs = null) {
        if (specs) {
            return (specs.width < MOBILE_WIDTH_THRESHOLD || specs.height < MOBILE_HEIGHT_THRESHOLD);
        } else {
            const window = this._page.window();
            return window.innerWidth < MOBILE_WIDTH_THRESHOLD || window.innerHeight < MOBILE_HEIGHT_THRESHOLD;
        }
    }

    isDesktopScreenSize(specs = null) {
        return !this.isMobileScreenSize(specs);
    }

    supportsDirectories() {
        return this._directories && !this.isMobile();
    }

    canReadFiles() {
        return this._readFiles;
    }

    supportsExtension(ext) {
        return this._rSupportedExtensions.test(ext);
    }

    supportsMime(mime) {
        return this._rSupportedMimes.test(mime);
    }

    supportedMimes() {
        return this._supportedMimes.slice();
    }

    logError(e) {
        if (this.isDevelopment()) {
            this.window.console.error(e && (e.stack || e.message) ? `${(e.stack || e.message)}` : e);
        }
    }

    async getRequiredPlatformFeatures() {
        if (this._retChecked) throw new Error(`already called`);
        this._retChecked = true;
        const features = {
            "Audio playback capability": [() => {
                try {
                    return !!(AudioContext);
                } catch (e) {
                    return false;
                }
            }, `http://caniuse.com/#feat=audio-api`, `Web Audio API`],

            "Database capability": [() => {
                try {
                    if ((this._browserName === `edge` && this._browserVersion < 14) || this._browserName === `safari` || this._isIe) {
                        return false;
                    }
                    return !!indexedDB && typeof indexedDB.open === `function`;
                } catch (e) {
                    return false;
                }
            }, `http://caniuse.com/#feat=indexeddb`, `IndexedDB API`],

            "File reading capability": [() => {
                try {
                    const ret = typeof File.prototype.slice === `function` &&
                              typeof Blob.prototype.slice === `function`;
                    const b = new Blob([], {type: `text/json`});
                    return ret && b.size === 0 && b.type === `text/json`;
                } catch (e) {
                    return false;
                }
            }, `http://caniuse.com/#feat=fileapi`, `File API`],

            "Cryptography": [() => {
                try {
                    return !!(crypto && crypto.subtle && crypto.subtle.digest);
                } catch (e) {
                    return false;
                }
            }, `https://caniuse.com/#feat=cryptography`, `Web Cryptography API`],

            "Multi-core utilization capability": [async () => {
                if (this._isSafari || this._isIe) {
                    return false;
                }
                let worker, url;
                try {
                    const ret = await new Promise((resolve) => {
                        const code = `var abc;`;
                        const blob = new Blob([code], {type: `application/javascript`});
                        url = URL.createObjectURL(blob);
                        worker = new Worker(url);
                        // IE10 supports only 1 transferable and this must not be counted as
                        // Supporting the feature.
                        const buffers = [
                            new Uint8Array([0xFF]),
                            new Uint8Array([0xFF])
                        ];
                        const transferList = buffers.map(v => v.buffer);
                        worker.postMessage({
                            transferList
                        }, transferList);

                        const buffersAreNeutered = buffers.filter(v => v.buffer.byteLength === 0).length === 2;
                        resolve(buffersAreNeutered);
                    });
                    return ret;
                } finally {
                    if (url) URL.revokeObjectURL(url);
                    if (worker) worker.terminate();
                }
            }, `http://caniuse.com/#feat=webworkers`, `Web Worker API`]
        };

        const ret = [];
        for (const description of Object.keys(features)) {
            const [checker, canIUseUrl, apiName] = features[description];
            let supported;
            try {
                supported = await Promise.resolve(checker());
            } catch (e) {
                supported = false;
            }
            ret.push({supported, canIUseUrl, apiName, description});
        }

        return ret;
    }

}
