import { typedKeys } from "shared/types/helpers";
import UAParser from "ua-parser-js";

import Page from "./dom/Page";

declare global {
    let DEBUGGING: boolean;
}

const MOBILE_WIDTH_THRESHOLD = 768;
const MOBILE_HEIGHT_THRESHOLD = 768;

export default class Env {
    private _page: Page;
    private _isDesktop: boolean;
    private _touch: boolean;
    private _directories: boolean;
    private _readFiles: boolean;
    private _mediaSession: boolean;
    private _isIe: boolean;
    private _isSafari: boolean;
    private _browserName: string;
    private _browserVersion: number;
    private _retChecked: boolean;
    private _isDevelopment: boolean;
    private _maxNotificationActions: number;

    constructor(page: Page) {
        this._page = page;
        page._setEnv(this);
        const document = page.document();
        const navigator = page.navigator();
        const window = page.window();

        const input = document.createElement(`input`);
        const desktopOs = /^(CentOS|Fedora|FreeBSD|Debian|Gentoo|GNU|Linux|Mac OS|Minix|Mint|NetBSD|OpenBSD|PCLinuxOS|RedHat|Solaris|SUSE|Ubuntu|UNIX VectorLinux|Windows)$/;

        const ua = new UAParser(navigator.userAgent);
        const device = ua.getDevice();
        const cpu = ua.getCPU();
        const os = ua.getOS();
        const browser = ua.getBrowser();
        const engine = ua.getEngine();

        let isDesktop = false;

        if (device && device.type) {
            isDesktop = !/^(console|mobile|tablet|smarttv|wearable|embedded)$/.test(device.type);
        } else if (cpu && cpu.architecture) {
            isDesktop = /^(amd64|ia32|ia64)$/.test(cpu.architecture);
        } else if (os && os.name) {
            isDesktop = desktopOs.test(os.name);
        }
        this._isDesktop = isDesktop;
        this._touch = `ontouchstart` in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;

        this._directories = `webkitdirectory` in input || `directory` in input || `mozdirectory` in input;
        this._readFiles = typeof FileReader === `function`;
        this._mediaSession = `mediaSession` in navigator;

        let browserName, browserVersion;
        let isIe = false;
        if (browser) {
            browserName = (browser.name || ``).toLowerCase();
            browserVersion = +(browser.major || 0);
        } else {
            browserName = "unknown";
            browserVersion = 1;
        }

        if (engine && engine.name && engine.name.toLowerCase().indexOf(`trident`) >= 0) {
            isIe = true;
        }

        this._isIe = isIe;
        this._isSafari = browserName === `safari`;
        this._browserName = browserName!;
        this._browserVersion = browserVersion!;
        this._retChecked = false;
        this._isDevelopment = process.env.NODE_ENV === "development";

        this._maxNotificationActions = 0;

        if (
            typeof Notification === `function` &&
            typeof Notification.maxActions === `number` &&
            typeof navigator.serviceWorker !== `undefined`
        ) {
            this._maxNotificationActions = Notification.maxActions;
        }
    }

    warn(...args: any[]) {
        if (this.isDevelopment()) {
            // eslint-disable-next-line no-console
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

    isMobileScreenSize(specs: { width: number; height: number } | null = null) {
        if (specs) {
            return specs.width < MOBILE_WIDTH_THRESHOLD || specs.height < MOBILE_HEIGHT_THRESHOLD;
        } else {
            const window = this._page.window();
            return window.innerWidth < MOBILE_WIDTH_THRESHOLD || window.innerHeight < MOBILE_HEIGHT_THRESHOLD;
        }
    }

    isDesktopScreenSize(specs: { width: number; height: number } | null = null) {
        return !this.isMobileScreenSize(specs);
    }

    supportsDirectories() {
        return this._directories && !this.isMobile();
    }

    canReadFiles() {
        return this._readFiles;
    }

    async getRequiredPlatformFeatures() {
        if (this._retChecked) throw new Error(`already called`);
        this._retChecked = true;
        const features: Record<string, [() => Promise<boolean> | boolean, string, string]> = {
            "Audio playback capability": [
                () => {
                    try {
                        return !!AudioContext;
                    } catch (e) {
                        return false;
                    }
                },
                `http://caniuse.com/#feat=audio-api`,
                `Web Audio API`,
            ],

            "Database capability": [
                () => {
                    try {
                        if (
                            (this._browserName === `edge` && this._browserVersion < 14) ||
                            this._browserName === `safari` ||
                            this._isIe
                        ) {
                            return false;
                        }
                        return !!indexedDB && typeof indexedDB.open === `function`;
                    } catch (e) {
                        return false;
                    }
                },
                `http://caniuse.com/#feat=indexeddb`,
                `IndexedDB API`,
            ],

            "File reading capability": [
                () => {
                    try {
                        const ret =
                            typeof File.prototype.slice === `function` && typeof Blob.prototype.slice === `function`;
                        const b = new Blob([], { type: `text/json` });
                        return ret && b.size === 0 && b.type === `text/json`;
                    } catch (e) {
                        return false;
                    }
                },
                `http://caniuse.com/#feat=fileapi`,
                `File API`,
            ],

            Cryptography: [
                () => {
                    try {
                        return !!(crypto && crypto.subtle && crypto.subtle.digest);
                    } catch (e) {
                        return false;
                    }
                },
                `https://caniuse.com/#feat=cryptography`,
                `Web Cryptography API`,
            ],

            "Multi-core utilization capability": [
                async () => {
                    if (this._isSafari || this._isIe) {
                        return false;
                    }
                    let worker: Worker | undefined, url: string | undefined;
                    try {
                        const ret = await new Promise<boolean>(resolve => {
                            const code = `var abc;`;
                            const blob = new Blob([code], { type: `application/javascript` });
                            url = URL.createObjectURL(blob);
                            worker = new Worker(url);
                            // IE10 supports only 1 transferable and this must not be counted as
                            // Supporting the feature.
                            const buffers = [new Uint8Array([0xff]), new Uint8Array([0xff])];
                            const transferList = buffers.map(v => v.buffer);
                            worker.postMessage(
                                {
                                    transferList,
                                },
                                transferList
                            );

                            const buffersAreNeutered = buffers.filter(v => v.buffer.byteLength === 0).length === 2;
                            resolve(buffersAreNeutered);
                        });
                        return ret;
                    } finally {
                        if (url) URL.revokeObjectURL(url);
                        if (worker) worker.terminate();
                    }
                },
                `http://caniuse.com/#feat=webworkers`,
                `Web Worker API`,
            ],
        };

        const ret: { supported: boolean; canIUseUrl: string; apiName: string; description: string }[] = [];
        for (const description of typedKeys(features)) {
            const [checker, canIUseUrl, apiName] = features[description]!;
            let supported;
            try {
                supported = await Promise.resolve(checker());
            } catch (e) {
                supported = false;
            }
            ret.push({ supported, canIUseUrl, apiName, description });
        }

        return ret;
    }
}
