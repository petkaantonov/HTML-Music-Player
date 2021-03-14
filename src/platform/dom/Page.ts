import Env from "platform/Env";
import Timers from "platform/Timers";
import { StringKeysOf, typedKeys } from "types/helpers";
import GestureObject from "ui/gestures/GestureObject";

export type DelegatedEvent<T extends Event | GestureObject> = T & { delegateTarget: HTMLElement };

const rTextarea = /^textarea$/i;
const rInput = /^input$/i;
const rKeyboard = /^(?:date|datetime|color|datetime-local|email|month|number|password|search|tel|text|time|url|week)$/i;
const rtouchevent = /^touch/;
const rAnyInput = /^(?:input|optgroup|select|textarea|option|button|label)$/i;
const rApple = /Mac|iPod|iPhone|iPad/;
const rClickOrTap = /^(?:click|touch)/;

export const isTouchEvent = function (e: Event | GestureObject): e is TouchEvent | GestureObject {
    return rtouchevent.test(e.type);
};

export const preventDefaultHandler = function (e: Event) {
    if (e.cancelable) {
        e.preventDefault();
    }
};

const isInputElement = (elem: HTMLElement): elem is HTMLInputElement => rInput.test(elem.nodeName);

const isSelectElement = (elem: HTMLElement): elem is HTMLSelectElement => elem.nodeName.toLowerCase() === `select`;

export const isTextInputElement = function (elem: HTMLElement): elem is HTMLInputElement | HTMLTextAreaElement {
    return (isInputElement(elem) && rKeyboard.test(elem.type)) || rTextarea.test(elem.nodeName);
};

export const isAnyInputElement = function (
    elem: HTMLElement
): elem is
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLOptGroupElement
    | HTMLSelectElement
    | HTMLOptionElement
    | HTMLButtonElement
    | HTMLLabelElement {
    return rAnyInput.test(elem.nodeName);
};

export const isRealClickOrTap = function (e: Event) {
    return e.isTrusted && rClickOrTap.test(e.type);
};

const documentCompare = function (a: Node, b: Node) {
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

const append = function (node: Node, frag: Node) {
    node.appendChild(frag);
};

const after = function (node: Node, frag: Node) {
    const parent = node.parentNode;
    if (!parent) return;

    const next = node.nextSibling;

    if (next) {
        parent.insertBefore(frag, next);
    } else {
        append(parent, frag);
    }
};

const before = function (node: Node, frag: Node) {
    const parent = node.parentNode;
    if (!parent) return;
    parent.insertBefore(frag, node);
};

const prepend = function (node: Node, frag: Node) {
    if (node.firstChild) {
        node.insertBefore(frag, node.firstChild);
    } else {
        append(node, frag);
    }
};

const stringValue = function (val: any) {
    return !val ? `` : `${val}`;
};

const setValue = function (elem: HTMLElement, value: string) {
    if (isSelectElement(elem)) {
        const { options } = elem;
        for (let i = 0; i < options.length; ++i) {
            const option = options[i]!;
            option.selected = option.value === value;
        }
    } else {
        (elem as HTMLInputElement).value = value;
    }
};

export type BaseKeyFrames = [
    Partial<Record<StringKeysOf<CSSStyleDeclaration>, string | number>>,
    Partial<Record<StringKeysOf<CSSStyleDeclaration>, string | number>>
];
const UNSET_BASE_KEY_FRAMES: BaseKeyFrames = [{}, {}];
let cachedWrapper: DomWrapper;

export type DomWrapperSelector = DomWrapper | string | null | HTMLElement | HTMLElement[] | DomWrapper | DomWrapper[];

function isArrayOrDomWrapper(item: object): item is DomWrapper | any[] {
    return Array.isArray(item) || item instanceof DomWrapper;
}

export class DomWrapper {
    private _page: Page;
    private _length: number;
    [index: number]: HTMLElement;

    constructor(selector: DomWrapperSelector, root: ParentNode | null | undefined, page: Page) {
        this._length = 0;
        this._page = page;
        if (typeof selector === `string`) {
            if (root === null || root === undefined) {
                root = page.document();
            }
            const result = root.querySelectorAll(selector);
            for (let i = 0; i < result.length; ++i) {
                this[i] = result[i] as HTMLElement;
            }
            this._length = result.length;
        } else if (typeof selector === `object` && selector !== null) {
            if (isArrayOrDomWrapper(selector)) {
                for (let i = 0; i < selector.length; ++i) {
                    const elem = selector[i];
                    if (elem !== null && typeof elem !== `undefined`) {
                        if (elem instanceof DomWrapper) {
                            for (let j = 0; j < elem._length; ++j) {
                                this._insert(elem[j]!);
                            }
                        } else if (elem.nodeType === 1) {
                            this._insert(elem);
                        }
                    }
                }
            } else if (selector.nodeType === 1) {
                this._length = 1;
                this[0] = selector;
            }
        }
    }

    _matches(elem: Element, selector: Element | DomWrapper | string) {
        if (selector instanceof DomWrapper) {
            for (let i = 0; i < selector._length; ++i) {
                if (elem === selector[i]) {
                    return true;
                }
            }
            return false;
        } else if (typeof selector === `string`) {
            return elem.matches(selector);
        } else {
            return elem === selector;
        }
    }

    _insert(elem: HTMLElement): void {
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
            const result = documentCompare(this[mid]!, elem);

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
                this[i] = this[i - 1]!;
            }
            this[left] = elem;
            this._length = length + 1;
        }
    }

    _toFragment(): DocumentFragment {
        const frag = this._page.document().createDocumentFragment();
        for (let i = 0; i < this._length; ++i) {
            frag.appendChild(this[i]!);
        }
        return frag;
    }

    innerHeight(): number {
        if (this._length === 0) return 0;
        const style = this.style();
        const padding = (parseInt(style.paddingTop, 10) || 0) + (parseInt(style.paddingBottom, 10) || 0);
        return this[0]!.clientHeight - padding;
    }

    innerWidth(): number {
        if (this._length === 0) return 0;
        const style = this.style();
        const padding = (parseInt(style.paddingLeft, 10) || 0) + (parseInt(style.paddingRight, 10) || 0);
        return this[0]!.clientWidth - padding;
    }

    outerHeight(): number {
        if (this._length === 0) return 0;
        const style = this.style();
        const margin = (parseInt(style.marginTop, 10) || 0) + (parseInt(style.marginBottom, 10) || 0);
        return this[0]!.offsetHeight + margin;
    }

    outerWidth(): number {
        if (this._length === 0) return 0;
        const style = this.style();
        const margin = (parseInt(style.marginLeft, 10) || 0) + (parseInt(style.marginRight, 10) || 0);
        return this[0]!.offsetWidth + margin;
    }

    find(selector: string): DomWrapper {
        const ret = new DomWrapper(null, null, this._page);

        for (let i = 0; i < this._length; ++i) {
            const results = this[i]!.querySelectorAll(selector);
            for (let j = 0; j < results.length; ++j) {
                ret._insert(results[j] as HTMLElement);
            }
        }
        return ret;
    }

    findOne(selector: string) {
        const ret = new DomWrapper(null, null, this._page);

        for (let i = 0; i < this._length; ++i) {
            const result = this[i]!.querySelector(selector);
            if (result) {
                ret._insert(result as HTMLElement);
            }
        }
        return ret;
    }

    findOneUnsafe(selector: string) {
        cachedWrapper[0] = this[0]!.querySelector(selector) as HTMLElement;
        return cachedWrapper;
    }

    addEventListener<K extends keyof HTMLElementEventMap>(
        name: K,
        handler: (ev: HTMLElementEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
    ) {
        if (typeof name !== `string`) throw new TypeError(`name must be string`);
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        if (this._length <= 0) throw new Error(`no elements would be affected`);

        for (let i = 0; i < this._length; ++i) {
            this[i]!.addEventListener(name, handler, options);
        }
        return this;
    }

    removeEventListener<K extends keyof HTMLElementEventMap>(
        name: K,
        handler: (ev: HTMLElementEventMap[K]) => any,
        options?: boolean | EventListenerOptions
    ) {
        if (typeof name !== `string`) throw new TypeError(`name must be string`);
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);

        for (let i = 0; i < this._length; ++i) {
            this[i]!.removeEventListener(name, handler, options);
        }
        return this;
    }

    mapToArray<T>(fn: (el: HTMLElement, index: number) => T) {
        const ret = new Array<T>(this._length);
        for (let i = 0; i < this._length; ++i) {
            ret[i] = fn(this[i]!, i);
        }
        return ret;
    }

    forEach(fn: (el: HTMLElement, index: number) => void) {
        for (let i = 0; i < this._length; ++i) {
            fn(this[i]!, i);
        }
        return this;
    }

    filter(fn: (el: HTMLElement, index: number) => boolean) {
        const ret = new DomWrapper(null, null, this._page);
        let k = 0;
        for (let i = 0; i < this._length; ++i) {
            if (fn(this[i]!, i)) {
                ret[k++] = this[i]!;
            }
        }
        ret._length = k;
        return ret;
    }

    _addClass(className: string) {
        if (typeof className === `string` && className.length > 0) {
            for (let i = 0; i < this._length; ++i) {
                this[i]!.classList.add(className);
            }
        }
    }

    _removeClass(className: string) {
        if (typeof className === `string` && className.length > 0) {
            for (let i = 0; i < this._length; ++i) {
                this[i]!.classList.remove(className);
            }
        }
    }

    _toggleClass(className: string) {
        if (typeof className === `string` && className.length > 0) {
            for (let i = 0; i < this._length; ++i) {
                this[i]!.classList.toggle(className);
            }
        }
    }

    _hasClass(className: string) {
        if (typeof className === `string` && className.length > 0) {
            for (let i = 0; i < this._length; ++i) {
                if (this[i]!.classList.contains(className)) {
                    return true;
                }
            }
        }
        return false;
    }

    addClass(classes: string | string[]) {
        if (typeof classes === `string`) {
            this._addClass(classes);
        } else {
            for (let i = 0; i < classes.length; ++i) this._addClass(classes[i]!);
        }
        return this;
    }

    removeClass(classes: string | string[]) {
        if (typeof classes === `string`) {
            this._removeClass(classes);
        } else {
            for (let i = 0; i < classes.length; ++i) this._removeClass(classes[i]!);
        }
        return this;
    }

    toggleClass(classes: string | string[]) {
        if (typeof classes === `string`) {
            this._toggleClass(classes);
        } else {
            for (let i = 0; i < classes.length; ++i) this._toggleClass(classes[i]!);
        }
        return this;
    }

    hasClass(classes: string | string[]) {
        if (typeof classes === `string`) {
            return this._hasClass(classes);
        } else {
            for (let i = 0; i < classes.length; ++i) {
                if (!this._hasClass(classes[i]!)) {
                    return false;
                }
            }
            return true;
        }
    }

    setProperty<T extends HTMLElement = HTMLElement>(name: keyof T, value: T[typeof name]) {
        for (let i = 0; i < this._length; ++i) {
            (this[i] as T)[name] = value;
        }
        return this;
    }

    setProperties<T extends HTMLElement>(properties: Partial<T>) {
        const keys = typedKeys(properties);

        for (let i = 0; i < keys.length; ++i) {
            this.setProperty(keys[i]! as any, properties[keys[i]!] as any);
        }
        return this;
    }

    setAttribute(name: string, value: string) {
        if (arguments.length !== 2) throw new Error(`wrong arguments`);
        for (let i = 0; i < this._length; ++i) {
            this[i]!.setAttribute(name, value);
        }
        return this;
    }

    setAttributes(attributes: Record<string, string>) {
        const keys = typedKeys(attributes);
        for (let i = 0; i < keys.length; ++i) {
            this.setAttribute(keys[i]!, attributes[keys[i]!]!);
        }
        return this;
    }

    removeAttribute(name: string) {
        for (let i = 0; i < this._length; ++i) {
            this[i]!.removeAttribute(name);
        }
        return this;
    }

    removeAttributes(attributes: string[]) {
        for (let i = 0; i < attributes.length; ++i) {
            this.removeAttribute(attributes[i]!);
        }
        return this;
    }

    setStyle(name: StringKeysOf<CSSStyleDeclaration>, value: string) {
        for (let i = 0; i < this._length; ++i) {
            const style = this[i]!.style;
            style[name] = value;
        }
        return this;
    }

    setStyles(styles: Partial<Record<StringKeysOf<CSSStyleDeclaration>, string>>) {
        const keys = typedKeys(styles);
        for (let i = 0; i < keys.length; ++i) {
            this.setStyle(keys[i]!, styles[keys[i]!]!);
        }
        return this;
    }

    add(...elems: HTMLElement[] | DomWrapper[]) {
        const ret = new DomWrapper(this, null, this._page);
        for (let i = 0; i < elems.length; ++i) {
            const wrap = new DomWrapper(elems[i]!, null, this._page);
            for (let j = 0; j < wrap._length; ++j) {
                ret._insert(wrap[j]!);
            }
        }
        return ret;
    }

    after(val: DomWrapperSelector) {
        const frag = new DomWrapper(val, null, this._page)._toFragment();
        let i = 0;
        for (; i < this._length - 1; ++i) {
            after(this[i]!, frag.cloneNode(true));
        }
        after(this[i]!, frag);
        return this;
    }

    before(val: DomWrapperSelector) {
        const frag = new DomWrapper(val, null, this._page)._toFragment();
        let i = 0;
        for (; i < this._length - 1; ++i) {
            before(this[i]!, frag.cloneNode(true));
        }
        before(this[i]!, frag);
        return this;
    }

    prepend(val: DomWrapperSelector) {
        const frag = new DomWrapper(val, null, this._page)._toFragment();
        let i = 0;
        for (; i < this._length - 1; ++i) {
            prepend(this[i]!, frag.cloneNode(true));
        }
        prepend(this[i]!, frag);
        return this;
    }

    appendHtml(html: string) {
        for (let i = 0; i < this._length; ++i) {
            this[i]!.insertAdjacentHTML(`beforeend`, html);
        }
        return this;
    }

    append(val: DomWrapperSelector) {
        const frag = new DomWrapper(val, null, this._page)._toFragment();

        let i = 0;
        for (; i < this._length - 1; ++i) {
            append(this[i]!, frag.cloneNode(true));
        }
        append(this[i]!, frag);
        return this;
    }

    insertAfter(val: DomWrapperSelector) {
        const target = new DomWrapper(val, null, this._page);
        target._length = 1;
        target.after(this);
        return this;
    }

    insertBefore(val: DomWrapperSelector) {
        const target = new DomWrapper(val, null, this._page);
        target._length = 1;
        target.before(this);
        return this;
    }

    prependTo(val: DomWrapperSelector) {
        const target = new DomWrapper(val, null, this._page);
        target._length = 1;
        target.prepend(this);
        return this;
    }

    appendTo(val: DomWrapperSelector) {
        const target = new DomWrapper(val, null, this._page);
        target._length = 1;
        target.append(this);
        return this;
    }

    parent() {
        const ret = new DomWrapper(null, null, this._page);
        for (let i = 0; i < this._length; ++i) {
            const elem = this[i]!.parentElement;
            if (elem !== null && typeof elem !== `undefined` && elem.nodeType === 1) {
                ret._insert(elem);
            }
        }
        return ret;
    }

    closest(selector: string | DomWrapper | Element) {
        const ret = new DomWrapper(null, null, this._page);
        mainLoop: for (let i = 0; i < this._length; ++i) {
            let elem: HTMLElement | null = this[i]!;
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
            this[i]!.remove();
        }
        return this;
    }

    remove() {
        return this.detach();
    }

    empty() {
        return this.setText(``);
    }

    setText(value: string) {
        return this.setProperty(`textContent`, value);
    }

    setHtml(value: string) {
        return this.setProperty(`innerHTML`, value);
    }

    hasParent() {
        return this[0]!.parentElement !== null;
    }

    style() {
        if (!this._length) throw new Error(`no elements`);
        return this._page.window().getComputedStyle(this[0]!, null);
    }

    setValue(value: string) {
        for (let i = 0; i < this._length; ++i) {
            setValue(this[i]!, value);
        }
        return this;
    }

    eq(index: number) {
        return new DomWrapper(this.get(+index)!, null, this._page);
    }

    get(index: number) {
        index = +index;
        if (index < 0) index = this._length + index;
        index %= this._length;
        return this[index];
    }

    animate(keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
        if (this._length > 0) {
            return this[0]!.animate(keyframes, options);
        }
        throw new Error(`no elements`);
    }

    value() {
        if (this._length > 0) {
            const elem = this[0]!;
            if (isSelectElement(elem)) {
                const opts = elem.options;
                const multiple = elem.type !== `select-one`;

                if (multiple) {
                    const vals: string[] = [];
                    for (let i = 0; i < opts.length; ++i) {
                        if (opts[i]!.selected) {
                            vals.push(stringValue(opts[i]!.value));
                        }
                    }
                    return vals;
                } else {
                    const index = elem.selectedIndex;
                    if (index >= 0 && index <= opts.length - 1) {
                        return stringValue(opts[index]!.value);
                    }
                    return ``;
                }
            } else {
                return stringValue((elem as HTMLInputElement).value);
            }
        }
        throw new Error(`no elements`);
    }

    setTransformOrigin(value: string) {
        this.setStyle(`transformOrigin`, value);
        return this;
    }

    getTransformOrigin(fromStyle: boolean) {
        if (!fromStyle) return this.style().transformOrigin;
        if (this._length === 0) throw new Error(`no elements`);
        return this[0]!.style.transformOrigin;
    }

    setFilter(value: string) {
        this.setStyle(`filter`, value);
        return this;
    }

    getFilter(fromStyle: boolean) {
        if (!fromStyle) return this.style().filter;
        if (this._length === 0) throw new Error(`no elements`);
        return this[0]!.style.filter;
    }

    setTransform(value: string) {
        this.setStyle(`transform`, value);
        return this;
    }

    getTransform(fromStyle = false) {
        if (!fromStyle) return this.style().transform;
        if (this._length === 0) throw new Error(`no elements`);
        return this[0]!.style.transform;
    }

    getTransformForKeyFrame(defaultValue = ``) {
        const transform = this.getTransform().trim();
        return transform === `none` || transform.length === 0 ? defaultValue : `${transform} `;
    }

    getScaleKeyFrames(
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        baseKeyFrames: BaseKeyFrames = UNSET_BASE_KEY_FRAMES
    ) {
        const base = this.getTransformForKeyFrame();

        return [
            Object.assign({ transform: `${base}scale3d(${startX}, ${startY}, 0)` }, baseKeyFrames[0]),
            Object.assign({ transform: `${base}scale3d(${endX}, ${endY}, 0)` }, baseKeyFrames[1]),
        ];
    }

    getTranslateKeyFrames(
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        baseKeyFrames: BaseKeyFrames = UNSET_BASE_KEY_FRAMES,
        nobase = false
    ) {
        const base = nobase ? `` : this.getTransformForKeyFrame();
        return [
            Object.assign({ transform: `${base}translate3d(${startX}px, ${startY}px, 0)` }, baseKeyFrames[0]),
            Object.assign({ transform: `${base}translate3d(${endX}px, ${endY}px, 0)` }, baseKeyFrames[1]),
        ];
    }

    animateTranslate(
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        animationOptions: KeyframeAnimationOptions = {}
    ) {
        const nobase = !animationOptions.composite;
        return this.animate(
            this.getTranslateKeyFrames(startX, startY, endX, endY, UNSET_BASE_KEY_FRAMES, nobase),
            animationOptions
        );
    }

    forceReflow() {
        for (let i = 0; i < this._length; ++i) {
            this[i]!.offsetWidth;
        }
        return this;
    }

    show(styleType: `block` | `inline-block` | `grid` = "block") {
        this.setStyle(`display`, styleType);
        return this;
    }

    hide() {
        this.setStyle(`display`, `none`);
        return this;
    }

    blur() {
        for (let i = 0; i < this._length; ++i) this[i]!.blur();
        return this;
    }

    click() {
        for (let i = 0; i < this._length; ++i) this[i]!.click();
        return this;
    }

    focus() {
        for (let i = 0; i < this._length; ++i) this[i]!.focus();
        return this;
    }

    is(selector: string | DomWrapper | Element) {
        for (let i = 0; i < this._length; ++i) {
            if (this._matches(this[i]!, selector)) {
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
    private _window: Window;
    private _notification: Notification;

    constructor(window: Window) {
        this._window = window;
        this._notification = (window as any).Notification;
    }

    requestNotificationPermission() {
        return new Promise(resolve => (this._notification as any).requestPermission(resolve));
    }

    notificationPermissionGranted() {
        return (this._notification as any).permission === `granted`;
    }

    disableMediaState() {
        this._window.navigator.mediaSession!.metadata = null;
        this._window.navigator.mediaSession!.playbackState = `none`;
    }

    setMediaState(opts: MediaMetadataInit & { isPlaying?: boolean; isPaused?: boolean }) {
        if (opts.isPlaying || opts.isPaused) {
            this._window.navigator.mediaSession!.metadata = new MediaMetadata(opts);
            this._window.navigator.mediaSession!.playbackState = opts.isPlaying ? `playing` : `paused`;
        } else {
            this._window.navigator.mediaSession!.metadata = null;
            this._window.navigator.mediaSession!.playbackState = `none`;
        }
    }
}

export default class Page {
    private _timers: Timers;
    private _platform: Platform;
    private _document: Document;
    private _window: Window;
    private _navigator: Navigator;
    private _location: Location;
    private _offlineDocument: Document;
    private _rafCallbacks: FrameRequestCallback[];
    private _rafId: number;
    private _documentHiddenPropertyName: keyof Document;
    private _modifierKey: "meta" | "ctrl";
    private _modifierKeyPropertyName: "metaKey" | "ctrlKey";
    private _null: DomWrapper;
    private _env: null | Env;

    constructor(document: Document, window: Window, timers: Timers) {
        cachedWrapper = new DomWrapper(null, null, this);
        (cachedWrapper as any)._length = 1;
        this._timers = timers;
        this._platform = new Platform(window);
        this._document = document;
        this._window = window;
        this._navigator = window.navigator;
        this._location = window.location;
        this._offlineDocument = this._document.implementation.createHTMLDocument(``);
        this._rafCallbacks = [];
        this._rafId = -1;
        const documentHidden = (function () {
            const resolvedPrefix = [`h`, `mozH`, `msH`, `webkitH`].reduce((prefix: string, curr: string) => {
                if (prefix) return prefix;
                return `${curr}idden` in document ? curr : prefix;
            }, ``);
            const propertyName = `${resolvedPrefix}idden` as keyof Document;
            const eventName = `${resolvedPrefix.slice(0, -1)}visibilitychange`;
            return { propertyName, eventName };
        })();
        this._documentHiddenPropertyName = documentHidden.propertyName;
        this._modifierKey = rApple.test(this.navigator().platform) ? `meta` : `ctrl`;
        this._modifierKeyPropertyName = this._modifierKey === "meta" ? "metaKey" : "ctrlKey";
        this._null = new DomWrapper(null, null, this);
        this._env = null;
    }

    _setEnv(env: Env) {
        this._env = env;
    }

    warn(...args: any[]) {
        if (this._env!.isDevelopment()) {
            this._env!.warn(...args);
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

    _rafCallback = (now: number) => {
        this._rafId = -1;
        try {
            while (this._rafCallbacks.length > 0) {
                const cb = this._rafCallbacks.shift()!;
                cb(now);
            }
        } finally {
            if (this._rafCallbacks.length > 0) {
                this._rafId = this.requestAnimationFrame(this._rafCallback);
            }
        }
    };

    NULL() {
        return this._null;
    }

    changeDom(callback: FrameRequestCallback) {
        for (let i = 0; i < this._rafCallbacks.length; ++i) {
            if (this._rafCallbacks[i] === callback) return;
        }
        this._rafCallbacks.push(callback);
        if (this._rafId === -1) {
            this._rafId = this.requestAnimationFrame(this._rafCallback);
        }
    }

    parse(html: string) {
        this._offlineDocument.body.innerHTML = `${html}`;
        const { children } = this._offlineDocument.body;
        let i = 0;
        const ret = new DomWrapper(null, null, this);
        (ret as any)._length = children.length;
        while (children.length > 0) {
            ret[i++] = this._document.adoptNode(children[0]!) as HTMLElement;
        }
        return ret;
    }

    ready() {
        const document = this._document;

        if (document.readyState === `complete` || document.readyState === `interactive`) {
            return Promise.resolve();
        }

        return new Promise(resolve => {
            function handler() {
                resolve(undefined);
                document.removeEventListener(`DOMContentLoaded`, handler, false);
            }
            document.addEventListener(`DOMContentLoaded`, handler, false);
        });
    }

    createElement(name: string, attributes?: Record<string, string>) {
        const ret = new DomWrapper(this._document.createElement(name), null, this);
        if (attributes) {
            ret.setAttributes(Object(attributes));
        }
        return ret;
    }

    $(selector: DomWrapperSelector, root?: ParentNode | null) {
        return new DomWrapper(selector, root, this);
    }

    delegatedEventHandler<T extends Event | GestureObject>(
        handler: (e: DelegatedEvent<T>) => void,
        selector: string,
        context?: any
    ): (e: T) => void {
        return function delegateEventHandler(e: T) {
            let node: HTMLElement | null = e.target as HTMLElement;

            while (node !== null && typeof node !== `undefined`) {
                const matches = node.matches(selector);
                if (matches) {
                    (e as DelegatedEvent<T>).delegateTarget = node;
                    handler.call(context || node, e as DelegatedEvent<T>);
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
        return this._document.activeElement as HTMLElement;
    }

    onDocumentVisibilityChange(handler: EventListener) {
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        return this.addDocumentListener(`visibilitychange`, handler);
    }

    offDocumentVisibilityChange(handler: EventListener) {
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        return this.removeDocumentListener(`visibilitychange`, handler);
    }

    addDocumentListener<K extends keyof DocumentEventMap>(
        name: K,
        handler: (ev: DocumentEventMap[K]) => any,
        useCapture?: AddEventListenerOptions
    ) {
        if (typeof name !== `string`) throw new TypeError(`name must be string`);
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        this._document.addEventListener(name, handler, useCapture);
    }

    removeDocumentListener<K extends keyof DocumentEventMap>(
        name: K,
        handler: (ev: DocumentEventMap[K]) => any,
        useCapture?: EventListenerOptions
    ) {
        if (typeof name !== `string`) throw new TypeError(`name must be string`);
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        this._document.removeEventListener(name, handler, useCapture);
    }

    addWindowListener<K extends keyof WindowEventMap>(
        name: K,
        handler: (ev: WindowEventMap[K]) => any,
        useCapture?: AddEventListenerOptions
    ) {
        if (typeof name !== `string`) throw new TypeError(`name must be string`);
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        this._window.addEventListener(name, handler, useCapture);
    }

    removeWindowListener<K extends keyof WindowEventMap>(
        name: K,
        handler: (ev: WindowEventMap[K]) => any,
        useCapture?: EventListenerOptions
    ) {
        if (typeof name !== `string`) throw new TypeError(`name must be string`);
        if (typeof handler !== `function`) throw new TypeError(`handler must be a function`);
        this._window.removeEventListener(name, handler, useCapture);
    }

    setTitle(val: string) {
        this._document.title = `${val}`;
    }

    setTimeout(fn: (...args: any[]) => any, time: number) {
        if (typeof fn !== `function`) throw new TypeError(`fn must be a function`);
        if (typeof time !== `number`) throw new TypeError(`time must be a number`);
        return this._timers.setTimeout(fn, time);
    }

    clearTimeout(handle: number) {
        if (typeof handle !== `number`) throw new TypeError(`handle must be a number`);
        if (+handle >= 0) {
            return this._timers.clearTimeout(+handle);
        }
        return -1;
    }

    setInterval(fn: (...args: any[]) => any, time: number) {
        if (typeof fn !== `function`) throw new TypeError(`fn must be a function`);
        if (typeof time !== `number`) throw new TypeError(`time must be a number`);
        return this._timers.setInterval(fn, time);
    }

    clearInterval(handle: number) {
        if (typeof handle !== `number`) throw new TypeError(`handle must be a number`);
        if (+handle >= 0) {
            return this._timers.clearInterval(+handle);
        }
        return -1;
    }

    requestAnimationFrame(fn: FrameRequestCallback) {
        if (typeof fn !== `function`) throw new TypeError(`fn must be a function`);
        return this._window.requestAnimationFrame(fn);
    }

    cancelAnimationFrame(handle: number) {
        if (typeof handle !== `number`) throw new TypeError(`handle must be a number`);
        if (+handle >= 0) {
            return this._window.cancelAnimationFrame(+handle);
        }
        return -1;
    }

    emulateClickEventFrom(baseEvent: KeyboardEvent) {
        const target = baseEvent.target as HTMLElement;
        const box = target.getBoundingClientRect();
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
            clientY: y,
        });
        target.dispatchEvent(ev);
    }
}
