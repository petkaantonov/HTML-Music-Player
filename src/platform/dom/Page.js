"use strict";

import { MouseEvent } from "platform/platform";

const rTextarea = /^textarea$/i;
const rInput = /^input$/i;
const rKeyboard = /^(?:date|datetime|color|datetime-local|email|month|number|password|search|tel|text|time|url|week)$/i;
const rtouchevent = /^touch/;
const rAnyInput = /^(?:input|optgroup|select|textarea|option|button|label)$/i;
const rApple = /Mac|iPod|iPhone|iPad/;

const documentCompare = function(a, b) {
    if (a === b) return 0;
    var result = a.compareDocumentPosition(b);

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
    var parent = node.parentNode;
    if (!parent) return;

    var next = node.nextSibling;

    if (next) {
        parent.insertBefore(frag, next);
    } else {
        append(parent, frag);
    }
};

const before = function(node, frag) {
    var parent = node.parentNode;
    if (!parent) return;
    parent.insertBefore(frag, node);
};

const prepend = function(node, frag) {
    if (node.firstChild) {
        node.insertBefore(frag, node.firstChild);
    } else {
        return append(node, frag);
    }
};

export function DomWrapper(selector, root, page) {
    this._length = 0;
    this._page = page;
    if (typeof selector === "string") {
        if (root === null) {
            root = page._document;
        }
        var result = root.querySelectorAll(selector);
        for (var i = 0; i < result.length; ++i) {
            this[i] = result[i];
        }
        this._length = result.length;
    } else if (selector != null && typeof selector === "object") {
        if (typeof selector.length === "number" &&
            typeof selector[0] === "object") {
            for (var i = 0; i < selector.length; ++i) {
                var elem = selector[i];
                if (elem != null) {
                    if (elem.nodeType === 1) {
                        this._insert(elem);
                    } else if (elem instanceof DomWrapper) {
                        for (var j = 0; j < elem._length; ++j) {
                            this._insert(elem[j]);
                        }
                    }
                }
            }
        } else if (selector.nodeType === 1) {
            this._length = 1;
            this[0] = selector;
        }
    }
}

DomWrapper.prototype._matches = function(elem, selector) {
    var matches = this._page._matches;
    if (selector instanceof DomWrapper) {
        for (var i = 0; i < selector._length; ++i) {
            if (elem === selector[i]) {
                return true;
            }
        }
        return false;
    } else if (typeof selector === "string") {
        return matches.call(elem, selector);
    } else {
        return elem === selector;
    }
};

DomWrapper.prototype._insert = function(elem) {
    const length = this._length;
    if (length === 0) {
        this._length = 1;
        this[0] = elem;
        return;
    }

    var left = 0;
    var right = length - 1;

    while (left <= right) {
        var mid = (left + right) >> 1;
        var result = documentCompare(this[mid], elem);

        if (result === 0) {
            return false;
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
        for (var i = length; i > left; --i) {
            this[i] = this[i - 1];
        }
        this[left] = elem;
        this._length = length + 1;
    }
    return true;
};

DomWrapper.prototype._toFragment = function() {
    var frag = this._page._document.createDocumentFragment();
    for (var i = 0; i < this._length; ++i) {
        frag.appendChild(this[i]);
    }
    return frag;
};

DomWrapper.prototype.innerHeight = function() {
    if (this._length === 0) return 0;
    var style = this.style();
    var padding = (parseInt(style.paddingTop, 10) || 0) +
                  (parseInt(style.paddingBottom, 10) || 0);
    return this[0].clientHeight - padding;
};

DomWrapper.prototype.innerWidth = function() {
    if (this._length === 0) return 0;
    var style = this.style();
    var padding = (parseInt(style.paddingLeft, 10) || 0) +
                  (parseInt(style.paddingRight, 10) || 0);
    return this[0].clientWidth - padding;
};

DomWrapper.prototype.outerHeight = function() {
    if (this._length === 0) return 0;
    var style = this.style();
    var margin = (parseInt(style.marginTop, 10) || 0) +
                  (parseInt(style.marginBottom, 10) || 0);
    return this[0].offsetHeight + margin;
};

DomWrapper.prototype.outerWidth = function() {
    if (this._length === 0) return 0;
    var style = this.style();
    var margin = (parseInt(style.marginLeft, 10) || 0) +
                  (parseInt(style.marginRight, 10) || 0);
    return this[0].offsetWidth + margin;
};

DomWrapper.prototype.find = function(selector) {
    var ret = new DomWrapper(null, null, this._page);

    for (var i = 0; i < this._length; ++i) {
        var results = this[i].querySelectorAll(selector);
        for (var j = 0; j < results.length; ++j) {
            ret._insert(results[j]);
        }
    }
    return ret;
};

DomWrapper.prototype.addEventListener = function(name, handler, useCapture) {
    if (typeof name !== "string") throw new TypeError("name must be string");
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    if (this._length <= 0) throw new Error("no elements would be affected");

    for (var i = 0; i < this._length; ++i) {
        this[i].addEventListener(name, handler, !!useCapture);
    }
    return this;
};

DomWrapper.prototype.removeEventListener = function(name, handler, useCapture) {
    if (typeof name !== "string") throw new TypeError("name must be string");
    if (typeof handler !== "function") throw new TypeError("handler must be a function");

    for (var i = 0; i < this._length; ++i) {
        this[i].removeEventListener(name, handler, !!useCapture);
    }
    return this;
};

DomWrapper.prototype.forEach = function(fn) {
    for (var i = 0; i < this._length; ++i) {
        fn(this[i], i);
    }
    return this;
};

DomWrapper.prototype.filter = function(fn) {
    var ret = new DomWrapper(null, null, this._page);
    var k = 0;
    for (var i = 0; i < this._length; ++i) {
        if (fn(this[i], i)) {
            ret[k++] = this[i];
        }
    }
    ret._length = k;
    return ret;
};

DomWrapper.prototype._addClass = function(className) {
    if (typeof className === "string" && className.length > 0) {
        for (var i = 0; i < this._length; ++i) {
            this[i].classList.add(className);
        }
    }
};

DomWrapper.prototype._removeClass = function(className) {
    if (typeof className === "string" && className.length > 0) {
        for (var i = 0; i < this._length; ++i) {
            this[i].classList.remove(className);
        }
    }
};

DomWrapper.prototype._toggleClass = function(className) {
    if (typeof className === "string" && className.length > 0) {
        for (var i = 0; i < this._length; ++i) {
            this[i].classList.toggle(className);
        }
    }
};

DomWrapper.prototype._hasClass = function(className) {
    if (typeof className === "string" && className.length > 0) {
        for (var i = 0; i < this._length; ++i) {
            if (this[i].classList.contains(className)) {
                return true;
            }
        }
    }
    return false;
};

DomWrapper.prototype.addClass = function(classes) {
    if (typeof classes === "string") {
        this._addClass(classes);
    } else {
        for (var i = 0; i < classes.length; ++i) this._addClass(classes[i]);
    }
    return this;
};

DomWrapper.prototype.removeClass = function(classes) {
    if (typeof classes === "string") {
        this._removeClass(classes);
    } else {
        for (var i = 0; i < classes.length; ++i) this._removeClass(classes[i]);
    }
    return this;
};

DomWrapper.prototype.toggleClass = function(classes) {
    if (typeof classes === "string") {
        this._toggleClass(classes);
    } else {
        for (var i = 0; i < classes.length; ++i) this._toggleClass(classes[i]);
    }
    return this;
};

DomWrapper.prototype.hasClass = function(classes) {
    if (typeof classes === "string") {
        return this._hasClass(classes);
    } else {
        for (var i = 0; i < classes.length; ++i) {
            if (!this._hasClass(classes[i])) {
                return false;
            }
        }
        return true;
    }
};

DomWrapper.prototype.setProperty = function(name, value) {
    if (arguments.length !== 2) throw new Error("wrong arguments");
    for (var i = 0; i < this._length; ++i) {
        this[i][name] = value;
    }
    return this;
};

DomWrapper.prototype.setProperties = function(properties) {
    var keys = Object.keys(properties);
    for (var i = 0; i < keys.length; ++i) {
        this.setProperty(keys[i], properties[keys[i]]);
    }
    return this;
};

DomWrapper.prototype.setAttribute = function(name, value) {
    if (arguments.length !== 2) throw new Error("wrong arguments");
    for (var i = 0; i < this._length; ++i) {
        this[i].setAttribute(name, value);
    }
    return this;
};

DomWrapper.prototype.setAttributes = function(attributes) {
    var keys = Object.keys(attributes);
    for (var i = 0; i < keys.length; ++i) {
        this.setAttribute(keys[i], attributes[keys[i]]);
    }
    return this;
};

DomWrapper.prototype.removeAttribute = function(name) {
    if (arguments.length !== 1) throw new Error("wrong arguments");
    for (var i = 0; i < this._length; ++i) {
        this[i].removeAttribute(name);
    }
    return this;
};

DomWrapper.prototype.removeAttributes = function(attributes) {
    for (var i = 0; i < attributes.length; ++i) {
        this.removeAttribute(attributes[i]);
    }
    return this;
};

DomWrapper.prototype.setStyle = function(name, value) {
    if (arguments.length !== 2) throw new Error("wrong arguments");
    for (var i = 0; i < this._length; ++i) {
        this[i].style[name] = value;
    }
    return this;
};

DomWrapper.prototype.setStyles = function(styles) {
    if (arguments.length !== 1) throw new Error("wrong arguments");
    var keys = Object.keys(styles);
    for (var i = 0; i < keys.length; ++i) {
        this.setStyle(keys[i], styles[keys[i]]);
    }
    return this;
};

DomWrapper.prototype.add = function() {
    var ret = new DomWrapper(this, null, this._page);
    for (var i = 0; i < arguments.length; ++i) {
        var wrap = new DomWrapper(arguments[i], null, this._page);
        for (var j = 0; j < wrap._length; ++j) {
            ret._insert(wrap[j]);
        }
    }
    return ret;
};

DomWrapper.prototype.after = function(val) {
    var frag = new DomWrapper(val, null, this._page)._toFragment();

    for (var i = 0; i < this._length - 1; ++i) {
        after(this[i], frag.cloneNode(true));
    }
    after(this[i], frag);
    return this;
};

DomWrapper.prototype.before = function(val) {
    var frag = new DomWrapper(val, null, this._page)._toFragment();

    for (var i = 0; i < this._length - 1; ++i) {
        before(this[i], frag.cloneNode(true));
    }
    before(this[i], frag);
    return this;
};

DomWrapper.prototype.prepend = function(val) {
    var frag = new DomWrapper(val, null, this._page)._toFragment();

    for (var i = 0; i < this._length - 1; ++i) {
        prepend(this[i], frag.cloneNode(true));
    }
    prepend(this[i], frag);
    return this;
};

DomWrapper.prototype.append = function(val) {
    var frag = new DomWrapper(val, null, this._page)._toFragment();

    for (var i = 0; i < this._length - 1; ++i) {
        append(this[i], frag.cloneNode(true));
    }
    append(this[i], frag);
    return this;
};

DomWrapper.prototype.insertAfter = function(val) {
    var target = new DomWrapper(val, null, this._page);
    target._length = 1;
    target.after(this);
    return this;
};

DomWrapper.prototype.insertBefore = function(val) {
    var target = new DomWrapper(val, null, this._page);
    target._length = 1;
    target.before(this);
    return this;
};

DomWrapper.prototype.prependTo = function(val) {
    var target = new DomWrapper(val, null, this._page);
    target._length = 1;
    target.prepend(this);
    return this;
};

DomWrapper.prototype.appendTo = function(val) {
    var target = new DomWrapper(val, null, this._page);
    target._length = 1;
    target.append(this);
    return this;
};

DomWrapper.prototype.parent = function() {
    var ret = new DomWrapper(null, null, this._page);
    for (var i = 0; i < this._length; ++i) {
        var elem = this[i].parentElement;
        if (elem != null && elem.nodeType === 1) {
            ret._insert(elem);
        }
    }
    return ret;
};

DomWrapper.prototype.closest = function(selector) {
    var ret = new DomWrapper(null, null, this._page);
    mainLoop: for (var i = 0; i < this._length; ++i) {
        var elem = this[i];
        while (elem != null) {
            if (this._matches(elem, selector)) {
                ret._insert(elem);
                continue mainLoop;
            }
            elem = elem.parentElement;
        }
    }
    return ret;
};

DomWrapper.prototype.detach = function() {
    for (var i = 0; i < this._length; ++i) {
        var node = this[i];
        var parent = node.parentNode;
        if (parent) {
            parent.removeChild(node);
        }
    }
    return this;
};

DomWrapper.prototype.remove = DomWrapper.prototype.detach;

DomWrapper.prototype.empty = function() {
    return this.setText("");
};

DomWrapper.prototype.setText = function(value) {
    return this.setProperty("textContent", value);
};

DomWrapper.prototype.setHtml = function(value) {
    return this.setProperty("innerHTML", value);
};

DomWrapper.prototype.style = function() {
    if (!this._length) throw new Error("no elements");
    return this._page._window.getComputedStyle(this[0], null);
};

const stringValue = function(val) {
    return !val ? "" : (val + "");
};

const setValue = function(elem, value) {
    if (elem.nodeName.toLowerCase() === "select") {
        var options = elem.options;
        for (var i = 0; i < options.length; ++i) {
            var option = options[i];
            option.selected = option.value === value;
        }
    } else {
        elem.value = value;
    }
};

DomWrapper.prototype.setValue = function(value) {
    for (var i = 0; i < this._length; ++i) {
        setValue(this[i], value);
    }
    return this;
};

DomWrapper.prototype.eq = function(index) {
    return new DomWrapper(this.get(+index), null, this._page);
};

DomWrapper.prototype.get = function(index) {
    index = +index;
    if (index < 0) index = this._length + index;
    index = index % this._length;
    return this[index];
};

DomWrapper.prototype.value = function() {
    if (this._length > 0) {
        var elem = this[0];
        if (elem.nodeName.toLowerCase() === "select") {
            var opts = elem.options;
            var multiple = elem.type !== "select-one";

            if (multiple) {
                var vals = [];
                for (var i = 0; i < opts.length; ++i) {
                    if (opts[i].selected) {
                        vals.push(stringValue(opts[i].value));
                    }
                }
                return vals;
            } else {
                var index = elem.selectedIndex;
                if (index >= 0 && index <= opts.length - 1) {
                    return stringValue(opts[index].value);
                }
                return "";
            }
        } else {
            return stringValue(elem.value);
        }
    }
    throw new Error("no elements");
};

DomWrapper.prototype.setTransformOrigin = function(value) {
    var prop = this._page._originStyle;
    this.setStyle(prop, value);
    return this;
};

DomWrapper.prototype.getTransformOrigin = function(fromStyle) {
    var prop = this._page._originStyle;
    if (!fromStyle) return this.style()[prop];
    if (this._length === 0) throw new Error("no elements");
    return this[0].style[prop];
};

DomWrapper.prototype.setFilter = function(value) {
    var prop = this._page._filterStyle;
    this.setStyle(prop, value);
    return this;
};

DomWrapper.prototype.getFilter = function(fromStyle) {
    var prop = this._page._filterStyle;
    if (!fromStyle) return this.style()[prop];
    if (this._length === 0) throw new Error("no elements");
    return this[0].style[prop];
};

DomWrapper.prototype.setTransform = function(value) {
    var prop = this._page._transformStyle;
    this.setStyle(prop, value);
    return this;
};

DomWrapper.prototype.getTransform = function(fromStyle) {
    var prop = this._page._transformStyle;
    if (!fromStyle) return this.style()[prop];
    if (this._length === 0) throw new Error("no elements");
    return this[0].style[prop];
};

DomWrapper.prototype.forceReflow = function() {
    for (var i = 0; i < this._length; ++i) {
        this[i].offsetWidth; // jshint ignore:line
    }
    return this;
};

DomWrapper.prototype.show = function(styleType) {
    if (!styleType) styleType = "block";
    this.setStyle("display", styleType);
    return this;
};

DomWrapper.prototype.hide = function() {
    this.setStyle("display", "none");
    return this;
};

DomWrapper.prototype.blur = function() {
    if (arguments.length > 0) throw new Error("bad arguments");
    for (var i = 0; i < this._length; ++i) this[i].blur();
    return this;
};

DomWrapper.prototype.click = function() {
    if (arguments.length > 0) throw new Error("bad arguments");
    for (var i = 0; i < this._length; ++i) this[i].click();
    return this;
};

DomWrapper.prototype.focus = function() {
    if (arguments.length > 0) throw new Error("bad arguments");
    for (var i = 0; i < this._length; ++i) this[i].focus();
    return this;
};

DomWrapper.prototype.is = function(selector) {
    for (var i = 0; i < this._length; ++i) {
        if (this._matches(this[i], selector)) {
            return true;
        }
    }
    return false;
};

Object.defineProperty(DomWrapper.prototype, "length", {
    enumerable: true, configurable: false,
    get: function() {
        return this._length;
    }
});

export default function Page(document, window) {
    this._document = document;
    this._window = window;
    this._navigator = window.navigator;
    this._location = window.location;
    this._offlineDocument = this._document.implementation.createHTMLDocument("");
    this._matches = document.createElement("div").matches ||
                    document.createElement("div").matchesSelector;
    this._rafCallbacks = [];
    this._rafId = -1;
    this._rafCallback = this._rafCallback.bind(this);


    var filterStyle, transformStyle, originStyle;
    var divStyle = this._document.createElement("div").style;

    if ("webkitFilter" in divStyle) {
        filterStyle = "webkitFilter";
    } else if ("mozFilter" in divStyle) {
        filterStyle = "mozFilter";
    } else {
        filterStyle = "filter";
    }

    if ("transform" in divStyle) {
        transformStyle = "transform";
        originStyle = "transformOrigin";
    } else if ("webkitTransform" in divStyle) {
        transformStyle = "webkitTransform";
        originStyle = "webkitTransformOrigin";
    } else {
        transformStyle = "mozTransform";
        originStyle = "mozTransformOrigin";
    }

    var documentHidden = (function() {
        var prefix = ["h", "mozH", "msH", "webkitH"].reduce(function(prefix, curr) {
            if (prefix) return prefix;
            return (curr + "idden") in document ? curr : prefix;
        }, null);
        var prop = prefix + "idden";
        var eventName = prefix.slice(0, -1) + "visibilitychange";
        return {
            propertyName: prop,
            eventName: eventName
        };
    })();

    this._filterStyle = filterStyle;
    this._transformStyle = transformStyle;
    this._originStyle = originStyle;
    this._documentVisibilityChangeEventName = documentHidden.eventName;
    this._documentHiddenPropertyName = documentHidden.propertyName;

    this._modifierKey = rApple.test(this.navigator().platform) ? "meta" : "ctrl";
    this._modifierKeyPropertyName = this._modifierKey + "Key";
    this._null = new DomWrapper(null, null, this);
}

Page.prototype.modifierKey = function() {
    return this._modifierKey;
};

Page.prototype.modifierKeyPropertyName = function() {
    return this._modifierKeyPropertyName;
};

Page.prototype.devicePixelRatio = function() {
    return +this._window.devicePixelRatio || 1;
};

Page.prototype.width = function() {
    return this._document.documentElement.clientWidth;
};

Page.prototype.height = function() {
    return this._document.documentElement.clientHeight;
};

Page.prototype._rafCallback = function(now) {
    this._rafId = -1;
    try {
        while (this._rafCallbacks.length > 0) {
            var cb = this._rafCallbacks.shift();
            cb.call(null, now);
        }
    } finally {
        if (this._rafCallbacks.length > 0) {
            this._rafId = this.requestAnimationFrame(this._rafCallback);
        }
    }
};

Page.prototype.NULL = function() {
    return this._null;
};

Page.prototype.isTouchEvent = function(e) {
    return rtouchevent.test(e.type);
};

Page.prototype.preventDefaultHandler = function(e) {
    if (e.cancelable) {
        e.preventDefault();
    }
};

Page.prototype.isTextInputElement = function(elem) {
    return (rInput.test(elem.nodeName) && rKeyboard.test(elem.type)) ||
        rTextarea.test(elem.nodeName);
};

Page.prototype.isAnyInputElement = function(elem) {
    return rAnyInput.test(elem.nodeName);
};

Page.prototype.changeDom = function(callback) {
    if (typeof callback !== "function") throw new Error("callback must be a function");
    for (var i = 0; i < this._rafCallbacks.length; ++i) {
        if (this._rafCallbacks[i] === callback) return;
    }
    this._rafCallbacks.push(callback);
    if (this._rafId === -1) {
        this._rafId = this.requestAnimationFrame(this._rafCallback);
    }
};

Page.prototype.parse = function(html) {
    this._offlineDocument.body.innerHTML = (html + "");
    var children = this._offlineDocument.body.children;
    var i = 0;
    var ret = new DomWrapper(null, null, this);
    ret._length = children.length;
    while (children.length > 0) {
        ret[i++] = this._document.adoptNode(children[0]);
    }
    return ret;
};

Page.prototype.ready = function() {
    var document = this._document;

    if (document.readyState === "complete" ||
        document.readyState === "loaded" ||
        document.readyState === "interactive") {
        return Promise.resolve();
    }

    return new Promise(function(resolve) {
        function handler() {
            resolve();
            document.removeEventListener("DOMContentLoaded", handler, false);
        }
        document.addEventListener("DOMContentLoaded", handler, false);
    });
};

Page.prototype.createElement = function(name, attributes) {
    var ret = new DomWrapper(this._document.createElement(name), null, this);
    if (attributes) {
        ret.setAttributes(Object(attributes));
    }
    return ret;
};

Page.prototype.$ = function(selector, root) {
    if (selector == null) {
        return new DomWrapper(null, null, this);
    }
    if (arguments.length <= 1) {
        root = this._document;
    }

    return new DomWrapper(selector, root, this);
};

Page.prototype.delegatedEventHandler = function(handler, selector, context) {
    if (typeof selector !== "string") throw new Error("selector must be a string");
    if (typeof handler !== "function") throw new Error("handler must be a function");

    var method = this._matches;

    return function delegateEventHandler(e) {
        var node = e.target;

        while (node != null) {
            var matches = method.call(node, selector);
            if (matches) {
                e.delegateTarget = node;
                return handler.call(context || node, e);
            }
            node = node.parentElement;
            if (node === e.currentTarget) {
                return;
            }
        }
    };
};

Page.prototype.navigator = function() {
    return this._navigator;
};

Page.prototype.location = function() {
    return this._location;
};

Page.prototype.window = function() {
    return this._window;
};

Page.prototype.document = function() {
    return this._document;
};

Page.prototype.isDocumentHidden = function() {
    return this._document[this._documentHiddenPropertyName];
};

Page.prototype.activeElement = function() {
    return this._document.activeElement;
};

Page.prototype.onDocumentVisibilityChange = function(handler) {
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    return this.addDocumentListener(this._documentVisibilityChangeEventName, handler);
};

Page.prototype.offDocumentVisibilityChange = function(handler) {
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    return this.removeDocumentListener(this._documentVisibilityChangeEventName, handler);
};

Page.prototype.addDocumentListener = function(name, handler, useCapture) {
    if (typeof name !== "string") throw new TypeError("name must be string");
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    this._document.addEventListener(name, handler, !!useCapture);
};

Page.prototype.removeDocumentListener = function(name, handler, useCapture) {
    if (typeof name !== "string") throw new TypeError("name must be string");
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    this._document.removeEventListener(name, handler, !!useCapture);
};

Page.prototype.addWindowListener = function(name, handler, useCapture) {
    if (typeof name !== "string") throw new TypeError("name must be string");
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    this._window.addEventListener(name, handler, !!useCapture);
};

Page.prototype.removeWindowListener = function(name, handler, useCapture) {
    if (typeof name !== "string") throw new TypeError("name must be string");
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    this._window.removeEventListener(name, handler, !!useCapture);
};

Page.prototype.setTitle = function(val) {
    this._document.title = ("" + val);
};

Page.prototype.setTimeout = function(fn, time) {
    if (typeof fn !== "function") throw new TypeError("fn must be a function");
    if (typeof time !== "number") throw new TypeError("time must be a number");
    return this._window.setTimeout(fn, time);
};

Page.prototype.clearTimeout = function(handle) {
    if (typeof handle !== "number") throw new TypeError("handle must be a number");
    if (+handle >= 0) {
        return this._window.clearTimeout(+handle);
    }
};

Page.prototype.setInterval = function(fn, time) {
    if (typeof fn !== "function") throw new TypeError("fn must be a function");
    if (typeof time !== "number") throw new TypeError("time must be a number");
    return this._window.setInterval(fn, time);
};

Page.prototype.clearInterval = function(handle) {
    if (typeof handle !== "number") throw new TypeError("handle must be a number");
    if (+handle >= 0) {
        return this._window.clearInterval(+handle);
    }
};

Page.prototype.requestAnimationFrame = function(fn) {
    if (typeof fn !== "function") throw new TypeError("fn must be a function");
    return this._window.requestAnimationFrame(fn);
};

Page.prototype.cancelAnimationFrame = function(handle) {
    if (typeof handle !== "number") throw new TypeError("handle must be a number");
    if (+handle >= 0) {
        return this._window.cancelAnimationFrame(+handle);
    }
};

Page.prototype.emulateClickEventFrom = function(baseEvent) {
    var box = baseEvent.target.getBoundingClientRect();
    var x = (((box.left + box.right) / 2) | 0) - this._window.scrollX;
    var y = (((box.top + box.bottom) / 2) | 0) - this._window.scrollY;
    var ev = new MouseEvent("click", {
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
};
