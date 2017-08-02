import {MouseEvent, MediaMetadata} from "platform/platform";

const rTextarea = /^textarea$/i;
const rInput = /^input$/i;
const rKeyboard = /^(?:date|datetime|color|datetime-local|email|month|number|password|search|tel|text|time|url|week)$/i;
const rtouchevent = /^touch/;
const rAnyInput = /^(?:input|optgroup|select|textarea|option|button|label)$/i;
const rApple = /Mac|iPod|iPhone|iPad/;
const rClickOrTap = /^(?:click|touch)/;

export const isTouchEvent = function(e) {
    return rtouchevent.test(e.type);
};

export const preventDefaultHandler = function(e) {
    if (e.cancelable) {
        e.preventDefault();
    }
};

export const isTextInputElement = function(elem) {
    return (rInput.test(elem.nodeName) && rKeyboard.test(elem.type)) ||
        rTextarea.test(elem.nodeName);
};

export const isAnyInputElement = function(elem) {
    return rAnyInput.test(elem.nodeName);
};

export const isRealClickOrTap = function(e) {
    return e.isTrusted && rClickOrTap.test(e.type);
};

const documentCompare = function(a, b) {
    if (a === b) return 0;
    const result = a.compareDocumentPosition(b);

    if (result === 0) {
        return 0;
    } else if ((result & 33) === 33) {
        return -1;
    } else {
        if ((result & 2) > 0) {
            return 1;
        } else if ((result & 4) > 0) {
            return -1;
        } else if ((result & 8) > 0) {
            return 1;
        } else if ((result & 16) > 0) {
            return -1;
        } else if ((result & 32) > 0) {
            return -1;
        }
    }
    return -1;
};

const append = function(node, frag) {
    node.appendChild(frag);
};

const after = function(node, frag) {
    const parent = node.parentNode;
    if (!parent) return;

    const next = node.nextSibling;

    if (next) {
        parent.insertBefore(frag, next);
    } else {
        append(parent, frag);
    }
};

const before = function(node, frag) {
    const parent = node.parentNode;
    if (!parent) return;
    parent.insertBefore(frag, node);
};

const prepend = function(node, frag) {
    if (node.firstChild) {
        node.insertBefore(frag, node.firstChild);
    } else {
        append(node, frag);
    }
};

const stringValue = function(val) {
    return !val ? `` : (`${val}`);
};

const setValue = function(elem, value) {
    if (elem.nodeName.toLowerCase() === `select`) {
        const {options} = elem;
        for (let i = 0; i < options.length; ++i) {
            const option = options[i];
            option.selected = option.value === value;
        }
    } else {
        elem.value = value;
    }
};

const UNSET_BASE_KEY_FRAMES = [{}, {}];

export class DomWrapper {
    constructor(selector, root, page) {
        this._length = 0;
        this._page = page;
        if (typeof selector === `string`) {
            if (root === null) {
                root = page._document;
            }
            const result = root.querySelectorAll(selector);
            for (let i = 0; i < result.length; ++i) {
                this[i] = result[i];
            }
            this._length = result.length;
        } else if (selector !== null && typeof selector === `object`) {
            if (selector.nodeType === 1) {
                this._length = 1;
                this[0] = selector;
            } else if (typeof selector.length === `number` &&
                       typeof selector[0] === `object`) {
                for (let i = 0; i < selector.length; ++i) {
                    const elem = selector[i];
                    if (elem !== null && typeof elem !== `undefined`) {
                        if (elem.nodeType === 1) {
                            this._insert(elem);
                        } else if (elem instanceof DomWrapper) {
                            for (let j = 0; j < elem._length; ++j) {
                                this._insert(elem[j]);
                            }
                        }
                    }
                }
            }
        }
    }

    _matches(elem, selector) {
        const matches = this._page._matches;
        if (selector instanceof DomWrapper) {
            for (let i = 0; i < selector._length; ++i) {
                if (elem === selector[i]) {
                    return true;
                }
            }
            return false;
        } else if (typeof selector === `string`) {
            return matches.call(elem, selector);
        } else {
            return elem === selector;
        }
    }

    _insert(elem) {
        const length = this._length;
        if (length === 0) {
            this._length = 1;
            this[0] = elem;
            return;
        }

        let left = 0;
        let right = length - 1;

        while (left <= right) {
            const mid = (left + right) >> 1;
            const result = documentCompare(this[mid], elem);

            if (result === 0) {
                return;
            } else if (result > 0) {
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }

        if (left === length) {
            this[length] = elem;
            this._length = length + 1;
        } else {
            for (let i = length; i > left; --i) {
                this[i] = this[i - 1];
            }
            this[left] = elem;
            this._length = length + 1;
        }
    }

    _toFragment() {
        const frag = this._page._document.createDocumentFragment();
        for (let i = 0; i < this._length; ++i) {
            frag.appendChild(this[i]);
        }
        return frag;
    }

    innerHeight() {
        if (this._length === 0) return 0;
        const style = this.style();
        const padding = (parseInt(style.paddingTop, 10) || 0) +
                      (parseInt(style.paddingBottom, 10) || 0);
        return this[0].clientHeight - padding;
    }

    innerWidth() {
        if (this._length === 0) return 0;
        const style = this.style();
        const padding = (parseInt(style.paddingLeft, 10) || 0) +
                      (parseInt(style.paddingRight, 10) || 0);
        return this[0].clientWidth - padding;
    }

    outerHeight() {
        if (this._length === 0) return 0;
        const style = this.style();
        const margin = (parseInt(style.marginTop, 10) || 0) +
                      (parseInt(style.marginBottom, 10) || 0);
        return this[0].offsetHeight + margin;
    }

    outerWidth() {
        if (this._length === 0) return 0;
        const style = this.style();
        const margin = (parseInt(style.marginLeft, 10) || 0) +
                      (parseInt(style.marginRight, 10) || 0);
        return this[0].offsetWidth + margin;
    }

    find(selector) {
        const ret = new DomWrapper(null, null, this._page);

        for (let i = 0; i < this._length; ++i) {
            const results = this[i].querySelectorAll(selector);
            for (let j = 0; j < results.length; ++j) {
                ret._insert(results[j]);
            }
        }
        return ret;
    }

    addEventListener(name, handler, useCapture) {
        if (typeof name !== `string`) throw new TypeError(`name must be string`);
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        if (this._length <= 0) throw new Error(`no elements would be affected`);

        for (let i = 0; i < this._length; ++i) {
            this[i].addEventListener(name, handler, useCapture);
        }
        return this;
    }

    removeEventListener(name, handler, useCapture) {
        if (typeof name !== `string`) throw new TypeError(`name must be string`);
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);

        for (let i = 0; i < this._length; ++i) {
            this[i].removeEventListener(name, handler, useCapture);
        }
        return this;
    }

    mapToArray(fn) {
        const ret = new Array(this._length);
        for (let i = 0; i < this._length; ++i) {
            ret[i] = fn(this[i], i);
        }
        return ret;
    }

    forEach(fn) {
        for (let i = 0; i < this._length; ++i) {
            fn(this[i], i);
        }
        return this;
    }

    filter(fn) {
        const ret = new DomWrapper(null, null, this._page);
        let k = 0;
        for (let i = 0; i < this._length; ++i) {
            if (fn(this[i], i)) {
                ret[k++] = this[i];
            }
        }
        ret._length = k;
        return ret;
    }

    _addClass(className) {
        if (typeof className === `string` && className.length > 0) {
            for (let i = 0; i < this._length; ++i) {
                this[i].classList.add(className);
            }
        }
    }

    _removeClass(className) {
        if (typeof className === `string` && className.length > 0) {
            for (let i = 0; i < this._length; ++i) {
                this[i].classList.remove(className);
            }
        }
    }

    _toggleClass(className) {
        if (typeof className === `string` && className.length > 0) {
            for (let i = 0; i < this._length; ++i) {
                this[i].classList.toggle(className);
            }
        }
    }

    _hasClass(className) {
        if (typeof className === `string` && className.length > 0) {
            for (let i = 0; i < this._length; ++i) {
                if (this[i].classList.contains(className)) {
                    return true;
                }
            }
        }
        return false;
    }

    addClass(classes) {
        if (typeof classes === `string`) {
            this._addClass(classes);
        } else {
            for (let i = 0; i < classes.length; ++i) this._addClass(classes[i]);
        }
        return this;
    }

    removeClass(classes) {
        if (typeof classes === `string`) {
            this._removeClass(classes);
        } else {
            for (let i = 0; i < classes.length; ++i) this._removeClass(classes[i]);
        }
        return this;
    }

    toggleClass(classes) {
        if (typeof classes === `string`) {
            this._toggleClass(classes);
        } else {
            for (let i = 0; i < classes.length; ++i) this._toggleClass(classes[i]);
        }
        return this;
    }

    hasClass(classes) {
        if (typeof classes === `string`) {
            return this._hasClass(classes);
        } else {
            for (let i = 0; i < classes.length; ++i) {
                if (!this._hasClass(classes[i])) {
                    return false;
                }
            }
            return true;
        }
    }

    setProperty(name, value) {
        if (arguments.length !== 2) throw new Error(`wrong arguments`);
        for (let i = 0; i < this._length; ++i) {
            this[i][name] = value;
        }
        return this;
    }

    setProperties(properties) {
        const keys = Object.keys(properties);
        for (let i = 0; i < keys.length; ++i) {
            this.setProperty(keys[i], properties[keys[i]]);
        }
        return this;
    }

    setAttribute(name, value) {
        if (arguments.length !== 2) throw new Error(`wrong arguments`);
        for (let i = 0; i < this._length; ++i) {
            this[i].setAttribute(name, value);
        }
        return this;
    }

    setAttributes(attributes) {
        const keys = Object.keys(attributes);
        for (let i = 0; i < keys.length; ++i) {
            this.setAttribute(keys[i], attributes[keys[i]]);
        }
        return this;
    }

    removeAttribute(name) {
        if (arguments.length !== 1) throw new Error(`wrong arguments`);
        for (let i = 0; i < this._length; ++i) {
            this[i].removeAttribute(name);
        }
        return this;
    }

    removeAttributes(attributes) {
        for (let i = 0; i < attributes.length; ++i) {
            this.removeAttribute(attributes[i]);
        }
        return this;
    }

    setStyle(name, value) {
        if (arguments.length !== 2) throw new Error(`wrong arguments`);
        for (let i = 0; i < this._length; ++i) {
            this[i].style[name] = value;
        }
        return this;
    }

    setStyles(styles) {
        if (arguments.length !== 1) throw new Error(`wrong arguments`);
        const keys = Object.keys(styles);
        for (let i = 0; i < keys.length; ++i) {
            this.setStyle(keys[i], styles[keys[i]]);
        }
        return this;
    }

    add(...elems) {
        const ret = new DomWrapper(this, null, this._page);
        for (let i = 0; i < elems.length; ++i) {
            const wrap = new DomWrapper(elems[i], null, this._page);
            for (let j = 0; j < wrap._length; ++j) {
                ret._insert(wrap[j]);
            }
        }
        return ret;
    }

    after(val) {
        const frag = new DomWrapper(val, null, this._page)._toFragment();
        let i = 0;
        for (; i < this._length - 1; ++i) {
            after(this[i], frag.cloneNode(true));
        }
        after(this[i], frag);
        return this;
    }

    before(val) {
        const frag = new DomWrapper(val, null, this._page)._toFragment();
        let i = 0;
        for (; i < this._length - 1; ++i) {
            before(this[i], frag.cloneNode(true));
        }
        before(this[i], frag);
        return this;
    }

    prepend(val) {
        const frag = new DomWrapper(val, null, this._page)._toFragment();
        let i = 0;
        for (; i < this._length - 1; ++i) {
            prepend(this[i], frag.cloneNode(true));
        }
        prepend(this[i], frag);
        return this;
    }

    append(val) {
        const frag = new DomWrapper(val, null, this._page)._toFragment();

        let i = 0;
        for (; i < this._length - 1; ++i) {
            append(this[i], frag.cloneNode(true));
        }
        append(this[i], frag);
        return this;
    }

    insertAfter(val) {
        const target = new DomWrapper(val, null, this._page);
        target._length = 1;
        target.after(this);
        return this;
    }

    insertBefore(val) {
        const target = new DomWrapper(val, null, this._page);
        target._length = 1;
        target.before(this);
        return this;
    }

    prependTo(val) {
        const target = new DomWrapper(val, null, this._page);
        target._length = 1;
        target.prepend(this);
        return this;
    }

    appendTo(val) {
        const target = new DomWrapper(val, null, this._page);
        target._length = 1;
        target.append(this);
        return this;
    }

    parent() {
        const ret = new DomWrapper(null, null, this._page);
        for (let i = 0; i < this._length; ++i) {
            const elem = this[i].parentElement;
            if (elem !== null && typeof elem !== `undefined` && elem.nodeType === 1) {
                ret._insert(elem);
            }
        }
        return ret;
    }

    closest(selector) {
        const ret = new DomWrapper(null, null, this._page);
        mainLoop: for (let i = 0; i < this._length; ++i) {
            let elem = this[i];
            while (elem !== null && typeof elem !== `undefined`) {
                if (this._matches(elem, selector)) {
                    ret._insert(elem);
                    continue mainLoop;
                }
                elem = elem.parentElement;
            }
        }
        return ret;
    }

    detach() {
        for (let i = 0; i < this._length; ++i) {
            this[i].remove();
        }
        return this;
    }

    remove() {
        return this.detach();
    }

    empty() {
        return this.setText(``);
    }

    setText(value) {
        return this.setProperty(`textContent`, value);
    }

    setHtml(value) {
        return this.setProperty(`innerHTML`, value);
    }

    hasParent() {
        return this[0].parentElement !== null;
    }

    style() {
        if (!this._length) throw new Error(`no elements`);
        return this._page._window.getComputedStyle(this[0], null);
    }

    setValue(value) {
        for (let i = 0; i < this._length; ++i) {
            setValue(this[i], value);
        }
        return this;
    }

    eq(index) {
        return new DomWrapper(this.get(+index), null, this._page);
    }

    get(index) {
        index = +index;
        if (index < 0) index = this._length + index;
        index %= this._length;
        return this[index];
    }

    animate(...args) {
        if (this._length > 0) {
            try {
                return this[0].animate(...args);
            } catch (e) {
                this.setStyles(args[1]);
                throw e;
            }
        }
        throw new Error(`no elements`);
    }

    value() {
        if (this._length > 0) {
            const elem = this[0];
            if (elem.nodeName.toLowerCase() === `select`) {
                const opts = elem.options;
                const multiple = elem.type !== `select-one`;

                if (multiple) {
                    const vals = [];
                    for (let i = 0; i < opts.length; ++i) {
                        if (opts[i].selected) {
                            vals.push(stringValue(opts[i].value));
                        }
                    }
                    return vals;
                } else {
                    const index = elem.selectedIndex;
                    if (index >= 0 && index <= opts.length - 1) {
                        return stringValue(opts[index].value);
                    }
                    return ``;
                }
            } else {
                return stringValue(elem.value);
            }
        }
        throw new Error(`no elements`);
    }

    setTransformOrigin(value) {
        const prop = this._page._originStyle;
        this.setStyle(prop, value);
        return this;
    }

    getTransformOrigin(fromStyle) {
        const prop = this._page._originStyle;
        if (!fromStyle) return this.style()[prop];
        if (this._length === 0) throw new Error(`no elements`);
        return this[0].style[prop];
    }

    setFilter(value) {
        const prop = this._page._filterStyle;
        this.setStyle(prop, value);
        return this;
    }

    getFilter(fromStyle) {
        const prop = this._page._filterStyle;
        if (!fromStyle) return this.style()[prop];
        if (this._length === 0) throw new Error(`no elements`);
        return this[0].style[prop];
    }

    setTransform(value) {
        const prop = this._page._transformStyle;
        this.setStyle(prop, value);
        return this;
    }

    getTransform(fromStyle = false) {
        const prop = this._page._transformStyle;
        if (!fromStyle) return this.style()[prop];
        if (this._length === 0) throw new Error(`no elements`);
        return this[0].style[prop];
    }

    getTransformForKeyFrame(defaultValue = ``) {
        const transform = this.getTransform().trim();
        return transform === `none` || transform.length === 0 ? defaultValue : `${transform} `;
    }

    getScaleKeyFrames(startX, startY, endX, endY, baseKeyFrames = UNSET_BASE_KEY_FRAMES) {
      const base = this.getTransformForKeyFrame();

      return [
        Object.assign({transform: `${base}scale3d(${startX}, ${startY}, 0)`}, baseKeyFrames[0]),
        Object.assign({transform: `${base}scale3d(${endX}, ${endY}, 0)`}, baseKeyFrames[1])
      ];
    }

    getTranslateKeyFrames(startX, startY, endX, endY, baseKeyFrames = UNSET_BASE_KEY_FRAMES, nobase = false) {
      const base = nobase ? `` : this.getTransformForKeyFrame();
      return [
        Object.assign({transform: `${base}translate3d(${startX}px, ${startY}px, 0)`}, baseKeyFrames[0]),
        Object.assign({transform: `${base}translate3d(${endX}px, ${endY}px, 0)`}, baseKeyFrames[1])
      ];
    }

    animateTranslate(startX, startY, endX, endY, animationOptions = {}) {
        const nobase = !!animationOptions.noComposite;
        return this.animate(this.getTranslateKeyFrames(startX, startY, endX, endY, UNSET_BASE_KEY_FRAMES, nobase),
                            animationOptions);
    }

    forceReflow() {
        for (let i = 0; i < this._length; ++i) {
            this[i].offsetWidth; // jshint ignore:line
        }
        return this;
    }

    show(styleType) {
        if (!styleType) styleType = `block`;
        this.setStyle(`display`, styleType);
        return this;
    }

    hide() {
        this.setStyle(`display`, `none`);
        return this;
    }

    blur() {
        if (arguments.length > 0) throw new Error(`bad arguments`);
        for (let i = 0; i < this._length; ++i) this[i].blur();
        return this;
    }

    click() {
        if (arguments.length > 0) throw new Error(`bad arguments`);
        for (let i = 0; i < this._length; ++i) this[i].click();
        return this;
    }

    focus() {
        if (arguments.length > 0) throw new Error(`bad arguments`);
        for (let i = 0; i < this._length; ++i) this[i].focus();
        return this;
    }

    is(selector) {
        for (let i = 0; i < this._length; ++i) {
            if (this._matches(this[i], selector)) {
                return true;
            }
        }
        return false;
    }

    get length() {
        return this._length;
    }
}

class Platform {
    constructor(window) {
        this._window = window;
    }

    requestNotificationPermission() {
        return new Promise(resolve => this._window.Notification.requestPermission(resolve));
    }

    notificationPermissionGranted() {
        return this._window.Notification.permission === `granted`;
    }

    disableMediaState() {
        this._window.navigator.mediaSession.metadata = null;
        this._window.navigator.mediaSession.playbackState = `none`;
    }

    setMediaState(opts) {
        if (opts.isPlaying || opts.isPaused) {
            this._window.navigator.mediaSession.metadata = new MediaMetadata(opts);
            this._window.navigator.mediaSession.playbackState = opts.isPlaying ? `playing` : `paused`;
        } else {
            this._window.navigator.mediaSession.metadata = null;
            this._window.navigator.mediaSession.playbackState = `none`;
        }
    }
}

export default class Page {
    constructor(document, window, timers) {
        this._timers = timers;
        this._platform = new Platform(window);
        this._document = document;
        this._window = window;
        this._navigator = window.navigator;
        this._location = window.location;
        this._offlineDocument = this._document.implementation.createHTMLDocument(``);
        this._matches = document.createElement(`div`).matches ||
                        document.createElement(`div`).matchesSelector;
        this._rafCallbacks = [];
        this._rafId = -1;
        this._rafCallback = this._rafCallback.bind(this);


        let filterStyle, transformStyle, originStyle;
        const divStyle = this._document.createElement(`div`).style;

        if (`webkitFilter` in divStyle) {
            filterStyle = `webkitFilter`;
        } else if (`mozFilter` in divStyle) {
            filterStyle = `mozFilter`;
        } else {
            filterStyle = `filter`;
        }

        if (`transform` in divStyle) {
            transformStyle = `transform`;
            originStyle = `transformOrigin`;
        } else if (`webkitTransform` in divStyle) {
            transformStyle = `webkitTransform`;
            originStyle = `webkitTransformOrigin`;
        } else {
            transformStyle = `mozTransform`;
            originStyle = `mozTransformOrigin`;
        }

        const documentHidden = (function() {
            const resolvedPrefix = [`h`, `mozH`, `msH`, `webkitH`].reduce((prefix, curr) => {
                if (prefix) return prefix;
                return (`${curr}idden`) in document ? curr : prefix;
            }, null);
            const propertyName = `${resolvedPrefix}idden`;
            const eventName = `${resolvedPrefix.slice(0, -1)}visibilitychange`;
            return {propertyName, eventName};
        }());

        this._filterStyle = filterStyle;
        this._transformStyle = transformStyle;
        this._originStyle = originStyle;
        this._documentVisibilityChangeEventName = documentHidden.eventName;
        this._documentHiddenPropertyName = documentHidden.propertyName;

        this._modifierKey = rApple.test(this.navigator().platform) ? `meta` : `ctrl`;
        this._modifierKeyPropertyName = `${this._modifierKey}Key`;
        this._null = new DomWrapper(null, null, this);
        this._env = null;
    }

    _setEnv(env) {
        this._env = env;
    }

    warn(...args) {
        if (this._env.isDevelopment()) {
            this._env.warn(...args);
        }
    }

    platform() {
        return this._platform;
    }

    modifierKey() {
        return this._modifierKey;
    }

    modifierKeyPropertyName() {
        return this._modifierKeyPropertyName;
    }

    devicePixelRatio() {
        return +this._window.devicePixelRatio || 1;
    }

    width() {
        return this._document.documentElement.clientWidth;
    }

    height() {
        return this._document.documentElement.clientHeight;
    }

    _rafCallback(now) {
        this._rafId = -1;
        try {
            while (this._rafCallbacks.length > 0) {
                const cb = this._rafCallbacks.shift();
                cb(now);
            }
        } finally {
            if (this._rafCallbacks.length > 0) {
                this._rafId = this.requestAnimationFrame(this._rafCallback);
            }
        }
    }

    NULL() {
        return this._null;
    }

    changeDom(callback) {
        if (typeof callback !== `function`) throw new Error(`callback must be a function`);
        for (let i = 0; i < this._rafCallbacks.length; ++i) {
            if (this._rafCallbacks[i] === callback) return;
        }
        this._rafCallbacks.push(callback);
        if (this._rafId === -1) {
            this._rafId = this.requestAnimationFrame(this._rafCallback);
        }
    }

    parse(html) {
        this._offlineDocument.body.innerHTML = (`${html}`);
        const {children} = this._offlineDocument.body;
        let i = 0;
        const ret = new DomWrapper(null, null, this);
        ret._length = children.length;
        while (children.length > 0) {
            ret[i++] = this._document.adoptNode(children[0]);
        }
        return ret;
    }

    ready() {
        const document = this._document;

        if (document.readyState === `complete` ||
            document.readyState === `loaded` ||
            document.readyState === `interactive`) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            function handler() {
                resolve();
                document.removeEventListener(`DOMContentLoaded`, handler, false);
            }
            document.addEventListener(`DOMContentLoaded`, handler, false);
        });
    }

    createElement(name, attributes) {
        const ret = new DomWrapper(this._document.createElement(name), null, this);
        if (attributes) {
            ret.setAttributes(Object(attributes));
        }
        return ret;
    }

    $(selector, root) {
        if (selector === null || typeof selector === `undefined`) {
            return new DomWrapper(null, null, this);
        }
        if (arguments.length <= 1) {
            root = this._document;
        }

        return new DomWrapper(selector, root, this);
    }

    delegatedEventHandler(handler, selector, context) {
        if (typeof selector !== `string`) throw new Error(`selector must be a string`);
        if (typeof handler !== `function`) throw new Error(`handler must be a function`);

        const method = this._matches;

        return function delegateEventHandler(e) {
            let node = e.target;

            while (node !== null && typeof node !== `undefined`) {
                const matches = method.call(node, selector);
                if (matches) {
                    e.delegateTarget = node;
                    handler.call(context || node, e);
                    return;
                }
                node = node.parentElement;
                if (node === e.currentTarget) {
                    return;
                }
            }
        };
    }

    navigator() {
        return this._navigator;
    }

    location() {
        return this._location;
    }

    window() {
        return this._window;
    }

    document() {
        return this._document;
    }

    isDocumentHidden() {
        return this._document[this._documentHiddenPropertyName];
    }

    activeElement() {
        return this._document.activeElement;
    }

    onDocumentVisibilityChange(handler) {
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        return this.addDocumentListener(this._documentVisibilityChangeEventName, handler);
    }

    offDocumentVisibilityChange(handler) {
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        return this.removeDocumentListener(this._documentVisibilityChangeEventName, handler);
    }

    addDocumentListener(name, handler, useCapture) {
        if (typeof name !== `string`) throw new TypeError(`name must be string`);
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        this._document.addEventListener(name, handler, !!useCapture);
    }

    removeDocumentListener(name, handler, useCapture) {
        if (typeof name !== `string`) throw new TypeError(`name must be string`);
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        this._document.removeEventListener(name, handler, !!useCapture);
    }

    addWindowListener(name, handler, useCapture) {
        if (typeof name !== `string`) throw new TypeError(`name must be string`);
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        this._window.addEventListener(name, handler, !!useCapture);
    }

    removeWindowListener(name, handler, useCapture) {
        if (typeof name !== `string`) throw new TypeError(`name must be string`);
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        this._window.removeEventListener(name, handler, !!useCapture);
    }

    setTitle(val) {
        this._document.title = (`${val}`);
    }

    setTimeout(fn, time) {
        if (typeof fn !== `function`) throw new TypeError(`fn must be a function`);
        if (typeof time !== `number`) throw new TypeError(`time must be a number`);
        return this._timers.setTimeout(fn, time);
    }

    clearTimeout(handle) {
        if (typeof handle !== `number`) throw new TypeError(`handle must be a number`);
        if (+handle >= 0) {
            return this._timers.clearTimeout(+handle);
        }
        return -1;
    }

    setInterval(fn, time) {
        if (typeof fn !== `function`) throw new TypeError(`fn must be a function`);
        if (typeof time !== `number`) throw new TypeError(`time must be a number`);
        return this._timers.setInterval(fn, time);
    }

    clearInterval(handle) {
        if (typeof handle !== `number`) throw new TypeError(`handle must be a number`);
        if (+handle >= 0) {
            return this._timers.clearInterval(+handle);
        }
        return -1;
    }

    requestAnimationFrame(fn) {
        if (typeof fn !== `function`) throw new TypeError(`fn must be a function`);
        return this._window.requestAnimationFrame(fn);
    }

    cancelAnimationFrame(handle) {
        if (typeof handle !== `number`) throw new TypeError(`handle must be a number`);
        if (+handle >= 0) {
            return this._window.cancelAnimationFrame(+handle);
        }
        return -1;
    }

    emulateClickEventFrom(baseEvent) {
        const box = baseEvent.target.getBoundingClientRect();
        const x = (((box.left + box.right) / 2) | 0) - this._window.scrollX;
        const y = (((box.top + box.bottom) / 2) | 0) - this._window.scrollY;
        const ev = new MouseEvent(`click`, {
            view: this._window,
            bubbles: true,
            cancelable: true,
            ctrlKey: baseEvent.ctrlKey,
            shiftKey: baseEvent.shiftKey,
            altKey: baseEvent.altKey,
            metaKey: baseEvent.metaKey,
            button: -1,
            buttons: 0,
            screenX: x,
            clientX: x,
            screenY: y,
            clientY: y
        });
        baseEvent.target.dispatchEvent(ev);
    }
}
