"use strict";
import $ from "jquery";
import { documentHidden, inherits, offCapture, onCapture, toFunction } from "lib/util";
import EventEmitter from "events";
import { changeDom, isTouchEvent, originProperty } from "lib/DomUtil";

const NULL = $(null);
const TRANSITION_IN_DURATION = 300;
const TRANSITION_OUT_DURATION = 200;

function ActionMenuItem(root, spec, children, level) {
    this.root = root;
    this.parent = null;
    this.children = children;
    this.id = spec.id;
    this.divider = !!spec.divider;
    this.disabled = !!spec.disabled;
    this.handler = typeof spec.onClick === "function" ? spec.onClick : $.noop;
    this.enabledPredicate = spec.enabledPredicate;

    this._preferredHorizontalDirection = "end";
    this._preferredVerticalDirection = "end";
    this._delayTimerId = -1;
    this._content = toFunction(spec.content);
    this._containerDom = NULL;
    this._domNode = this._createDom();

    if (this.disabled) this.$().addClass(this.root.disabledClass);

    this.itemMouseEntered = this.itemMouseEntered.bind(this);
    this.itemMouseLeft = this.itemMouseLeft.bind(this);
    this.containerMouseEntered = this.containerMouseEntered.bind(this);
    this.containerMouseLeft = this.containerMouseLeft.bind(this);
    this.itemClicked = this.itemClicked.bind(this);
    this.positionSubMenu = this.positionSubMenu.bind(this);
    this.itemTouchStarted = this.itemTouchStarted.bind(this);

    this.containerTouchedRecognizer = this.root.recognizerMaker.createTouchdownRecognizer(this.containerMouseEntered);
    this.tapRecognizer = this.root.recognizerMaker.createTapRecognizer(this.itemClicked);
    this.itemTouchedRecognizer = this.root.recognizerMaker.createTouchdownRecognizer(this.itemTouchStarted);

    if (this.children) {
        this._containerDom = this._createContainerDom(level);
        this.children.forEach(function(child) {
            child.setParent(this);
        }, this);

        this.$().on("mouseenter", this.itemMouseEntered);
        this.$().on("mouseleave", this.itemMouseLeft);
        this.$container().on("mouseenter", this.containerMouseEntered);
        this.$container().on("mouseleave", this.containerMouseLeft);

        this.containerTouchedRecognizer.recognizeBubbledOn(this.$container());
    }

    if (!this.divider) {
        this.$().on("click", this.itemClicked);
        this.tapRecognizer.recognizeBubbledOn(this.$());
        this.itemTouchedRecognizer.recognizeBubbledOn(this.$());
    }
}

ActionMenuItem.prototype.destroy = function() {
    this._clearDelayTimer();
    this.$().remove();
    this.$container().remove();
};

ActionMenuItem.prototype._clearDelayTimer = function() {
    if (this._delayTimerId !== -1) {
        clearTimeout(this._delayTimerId);
        this._delayTimerId = -1;
    }
};

ActionMenuItem.prototype.startHideTimer = function() {
    this._clearDelayTimer();
    var self = this;
    this._delayTimerId = setTimeout(function() {
        self._delayTimerId = -1;
        self.hideContainer();
    }, this.root.hideDelay);
};

ActionMenuItem.prototype.hideChildren = function(targetMenuItem) {
    for (var i = 0; i < this.children.length; ++i) {
        var child = this.children[i];
        if (child.children) {
            if (targetMenuItem && $(targetMenuItem).closest(child.$()).length) {
                continue;
            }
            child.startHideTimer();
            child.hideChildren();
        }
    }
};

ActionMenuItem.prototype.menuItemTouchStarted = function(child) {
    for (var i = 0; i < this.children.length; ++i) {
        var otherChild = this.children[i];
        if (child !== otherChild) {
            otherChild.removeActiveClass();
            otherChild.hideContainer();
        }
    }
};

ActionMenuItem.prototype.itemTouchStarted = function(e) {
    this.root.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, this.zIndex() + 1);
    var parent = this.parent ? this.parent : this.root;
    parent.menuItemTouchStarted(this);
    if (this.children) {
        this.initSubMenuShowing(0);
    }
};

ActionMenuItem.prototype.initSubMenuShowing = function(delay) {
    this.addActiveClass();
    this.root.clearDelayTimer();
    this._clearDelayTimer();
    if (this.disabled) return;
    if (this.isShown()) {
        this.hideChildren();
        return;
    }
    var self = this;
    this._delayTimerId = setTimeout(function() {
        self._delayTimerId = -1;
        self.showContainer();
    }, delay);
};

ActionMenuItem.prototype.itemMouseEntered = function() {
    this.initSubMenuShowing(this.root.showDelay);
};

ActionMenuItem.prototype.itemMouseLeft = function(e) {
    this._clearDelayTimer();
    if (this.disabled) return;
    if (!$(e.relatedTarget).closest(this.$container()).length) {
        this.removeActiveClass();
        this.startHideTimer();
    }
};

ActionMenuItem.prototype.zIndex = function() {
    var container = this.parent ? this.parent.$container() : this.root.$();
    return +container.css("zIndex");
};

ActionMenuItem.prototype.containerMouseLeft = function(e) {
    if (this.disabled) return;
    this._clearDelayTimer();
    var $related = $(e.relatedTarget);
    if ($related.closest(this.$()).length) {
        return;
    }

    var container = this.parent ? this.parent.$container() : this.root.$();

    if ($related.closest(container).length) {
        this.startHideTimer();
        return;
    }
    this.root.startHideTimer();
};

ActionMenuItem.prototype.containerMouseEntered = function(e) {
    if (this.disabled) return;
    this.root.clearDelayTimer();
    this._clearDelayTimer();
    this.addActiveClass();
    if (this.isShown()) {
        this.hideChildren(e.target);
    }
};

ActionMenuItem.prototype.itemClicked = function(e) {
    if (this.disabled) {
        this.root.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, this.zIndex() + 1);
        return;
    }
    if (this.children) {
        this._clearDelayTimer();
        if (!this.isShown()) {
            this.showContainer();
        }
    } else {
        var prevented = false;
        try {
            this.handler({preventDefault: function() {prevented = true;}});
        } finally {
            if (!prevented) {
                this.root.hideContainer();
                this.root.emit("itemClick", this.id);
            } else {
                this.root.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, this.zIndex() + 1);
            }
        }
    }
};

ActionMenuItem.prototype.$ = function() {
    return this._domNode;
};

ActionMenuItem.prototype.$container = function() {
    return this._containerDom;
};

ActionMenuItem.prototype._createContainerDom = function(level) {
    var levelClass = level <= 5 ? "action-menu-level-" + level
                                : "action-menu-level-too-deep";

    return $('<div>', {
        class: this.root.containerClass + " " + levelClass
    }).css({
        position: "absolute",
        zIndex: Math.max(50, level * 100000)
    });
};

ActionMenuItem.prototype._createDom = function() {
    if (this.divider) {
        var node = $('<div>', {class: this.root.dividerClass});
        if (typeof this.divider === "function" && !this.divider()) {
            node.hide();
        }
        return node;
    } else {
        var content = this._content(this);
        var node = $('<div>', {class: this.root.itemClass});
        if (typeof content === "string") {
            node.html(content);
        } else if (content == null) {
            node.hide();
        } else {
            node.empty().append(content);
        }
        return node;
    }
};

ActionMenuItem.prototype.refresh = function() {
    if (!this.isShown()) return;

    if (this.divider) {
        if (typeof this.divider === "function") {
            if (this.divider()) {
                this.$().show();
            } else {
                this.$().hide();
            }
        }
        return;
    }

    var content = this._content(this);

    if (typeof content === "string") {
        this.$().html(content).show();
    } else if (content == null) {
        this.$().empty().hide();
    } else {
        this.$().show().empty().append(content);
    }
    if (this.parent) this.parent.positionSubMenu();
};

ActionMenuItem.prototype.setParent = function(parent) {
    this.parent = parent;
    this.$().appendTo(this.parent.$container());
    this.parent.$().addClass("action-menu-sub-menu-item");
};

ActionMenuItem.prototype.setEnabledStateFromPredicate = function(args) {
    if (typeof this.enabledPredicate === "function") {
        var enabled = this.enabledPredicate.apply(null, args);
        if (enabled) {
            this.enable();
        } else {
            this.disable();
        }
    }
};

ActionMenuItem.prototype.enable = function() {
    if (!this.disabled) return;
    this.disabled = false;
    this.$().removeClass(this.root.disabledClass);
};

ActionMenuItem.prototype.disable = function() {
    if (this.disabled) return;
    this.disabled = true;
    this.$().addClass(this.root.disabledClass);
    this.hideContainer();
};

ActionMenuItem.prototype.isShown = function() {
    if (this.$container() !== NULL) {
        return this.$container().parent().length > 0;
    }
    return this.$().parent().length > 0;
};

ActionMenuItem.prototype.getHorizontalDirection = function() {
    return this.parent ? this.parent._preferredHorizontalDirection
                       : this._preferredHorizontalDirection;
};

ActionMenuItem.prototype.getVerticalDirection = function() {
    return this.parent ? this.parent._preferredVerticalDirection
                       : this._preferredVerticalDirection;
};

ActionMenuItem.prototype.positionInDimension = function(preferredDirection,
                                                        coordStart,
                                                        coordEnd,
                                                        dimensionValue,
                                                        maxValue) {
    var roomOnEnd = maxValue - (coordEnd - 3 + dimensionValue);
    var roomOnStart = coordStart + 3 - dimensionValue;
    var ret = -1;

    // Doesn't fit anywhere.
    if (roomOnStart < 0 && roomOnEnd < 0) {
        if (roomOnStart > roomOnEnd) {
            preferredDirection = "end";
            ret = Math.min(maxValue, coordStart + 3) - dimensionValue;
            ret = Math.max(0, Math.min(maxValue - dimensionValue, ret));
        } else {
            preferredDirection = "start";
            ret = Math.max(0, coordEnd - 3);
            ret = Math.max(0, Math.min(maxValue - dimensionValue, ret));
        }
    } else {
        while (ret < 0 || ret + dimensionValue > maxValue) {
            if (preferredDirection === "end") {
                ret = Math.max(0, coordEnd - 3);

                if (ret + dimensionValue > maxValue) {
                    ret = Math.min(maxValue, coordStart + 3) - dimensionValue;
                    ret = Math.max(0, Math.min(maxValue - dimensionValue, ret));

                    preferredDirection = "start";
                }
            } else {
                ret = Math.min(maxValue, coordStart + 3) - dimensionValue;
                ret = Math.min(maxValue - dimensionValue, ret);

                if (ret < 0) {
                    ret = Math.max(0, coordEnd - 3);
                    ret = Math.max(0, Math.min(maxValue - dimensionValue, ret));
                    preferredDirection = "end";
                }
            }
        }
    }

    return {
        coordStart: ret,
        preferredDirection: preferredDirection
    };
};

ActionMenuItem.prototype.positionSubMenu = function() {
    if (!this.isShown()) return;
    var itemBox = this.$()[0].getBoundingClientRect();
    var containerBox = this.$container()[0].getBoundingClientRect();
    var xMax = $(window).width();
    var yMax = $(window).height();

    var origin = {x: 0, y: 0};
    var left = -1;
    var top = -1;

    var preferredDirection = this.getHorizontalDirection();
    var positionResult =
        this.positionInDimension(preferredDirection, itemBox.left, itemBox.right, containerBox.width, xMax);
    left = positionResult.coordStart;
    this._preferredHorizontalDirection = positionResult.preferredDirection;

    preferredDirection = this.getVerticalDirection();
    positionResult =
        this.positionInDimension(preferredDirection, itemBox.top + 3, itemBox.top + 3, containerBox.height, yMax);
    top = positionResult.coordStart;
    this._preferredVerticalDirection = positionResult.preferredDirection;

    this.$container().css({
        top: top,
        left: left
    });

    origin.x = left > itemBox.left + 3 ? 0 : containerBox.width;
    origin.y = top > itemBox.top + 3 ? 0 : Math.max(itemBox.top - top, 0);

    return origin;
};

ActionMenuItem.prototype.addActiveClass = function() {
    if (this.disabled) return;
    this.$().addClass(this.root.activeSubMenuClass);
};

ActionMenuItem.prototype.removeActiveClass = function() {
    this.$().removeClass(this.root.activeSubMenuClass);
};

ActionMenuItem.prototype.showContainer = function() {
    this.addActiveClass();
    this.$container().css("willChange", "transform");
    this.$container().removeClass("transition-out transition-in initial").appendTo("body");
    var origin = this.positionSubMenu();
    this.$container().css(originProperty, origin.x + "px " + origin.y + "px 0px");
    this.$container().detach();
    this.$container().removeClass("transition-out").addClass("initial transition-in");
    this.$container().appendTo("body");
    this.$container().width();
    var self = this;
    changeDom(function() {
        self.$container().removeClass("initial");
        setTimeout(function() {
            self.$container().css("willChange", "");
        }, TRANSITION_IN_DURATION);
    });
};

ActionMenuItem.prototype.hideContainer = function() {
    this._preferredVerticalDirection = "end";
    this._preferredHorizontalDirection = "end";
    this._clearDelayTimer();
    this.$container().css("willChange", "transform");
    this.$container().removeClass("transition-in").addClass("initial transition-out");
    this.$container().width();
    var self = this;
    changeDom(function() {
        self.$container().removeClass("initial");
        self._delayTimerId = setTimeout(function() {
            self._delayTimerId = -1;
            self.$container().detach().css("willChange", "");
        }, TRANSITION_OUT_DURATION);
    });
    this.removeActiveClass();
    if (this.children) {
        this.children.forEach(function(child) {
            child.hideContainer();
        });
    }
};

function createMenuItem(root, spec, level) {
    var children = null;
    if (spec.children) {
        if (spec.divider) throw new Error("divider cannot have children");
        var children = spec.children.map(function(childSpec) {
            return createMenuItem(root, childSpec, level + 1);
        });
    }
    return new ActionMenuItem(root, spec, children, level);
}

export default function ActionMenu(opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this.rippler = opts.rippler;
    this.recognizerMaker = opts.recognizerMaker;
    this.rootClass = opts.rootClass || "action-menu-root";
    this.containerClass = opts.containerClass || "action-menu-submenu";
    this.itemClass = opts.itemClass || "action-menu-item";
    this.disabledClass = opts.disabledClass || "action-menu-disabled";
    this.dividerClass = opts.dividerClass || "action-menu-divider";
    this.activeSubMenuClass = opts.activeSubMenuClass || "action-menu-active";
    this.showDelay = Math.min(1000, Math.max(0, +opts.subMenuShowDelay || 300));
    this.hideDelay = Math.min(3000, Math.max(0, +opts.subMenuHideDelay || 800));


    this._delayTimerId = -1;
    this._domNode = $('<div>', {
        class: this.rootClass
    });

    this._menuItems = opts.menu.map(function(spec) {
        return createMenuItem(this, spec, opts._initialLevel || 1);
    }, this);

    this._menuItems.forEach(function(item) {
        item.$().appendTo(this.$());
    }, this);

    this._idToItem = {};
    this.forEach(function(item) {
        if (item.divider) return;
        if (!item.id) {
            throw new Error("unique id is required for menu item");
        }
        var id = item.id + "";

        if (this._idToItem[id]) {
            throw new Error("unique id is required for menu item. " + id + " is duplicate.");
        }

        this._idToItem[id] = item;
    }, this);
}
inherits(ActionMenu, EventEmitter);

prototype.setEnabledStateFromPredicate = function() {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; ++i) {
        args[i] = arguments[i];
    }

    this.forEach(function(item) {
        if (item.divider) return;
        item.setEnabledStateFromPredicate(args);
    });
};

prototype.destroy = function() {
    this.clearDelayTimer();
    this.forEach(function(child) { child.destroy(); });
    this.hideContainer();
    this.$().remove();
    this.removeAllListeners();
};

prototype.menuItemTouchStarted = function(child) {
    for (var i = 0; i < this._menuItems.length; ++i) {
        var otherChild = this._menuItems[i];
        if (child !== otherChild) {
            otherChild.removeActiveClass();
            otherChild.hideContainer();
        }
    }
};

prototype.$containers = function() {
    var ret = this.$();
    this.forEach(function(item) {
        if (item.children && item.isShown())  {
            ret = ret.add(item.$container()[0]);
        }
    });
    return ret;
};

prototype.$ = function() {
    return this._domNode;
};

prototype.clearDelayTimer = function() {
    if (this._delayTimerId !== -1) {
        clearTimeout(this._delayTimerId);
        this._delayTimerId = -1;
    }
};

prototype.startHideTimer = function() {
    this.clearDelayTimer();
    var self = this;
    this._delayTimerId = setTimeout(function() {
        self._delayTimerId = -1;
        self.hideContainer();
    }, this.hideDelay);
};

prototype.hideContainer = function() {
    this._menuItems.forEach(function(item) {
        item.hideContainer();
    });
};

prototype.forEach = function(fn, ctx) {
    var items = this._menuItems.slice();
    var index = 0;

    while (items.length > 0) {
        var item = items.shift();

        if (item.children) {
            items.push.apply(items, item.children);
        }

        if (fn.call(ctx || item, item, index) === false) return;
        index++;
    }
};

prototype.refreshAll = function() {
    this.forEach(ActionMenuItem.prototype.refresh);
};

prototype.disableAll = function() {
    this.forEach(ActionMenuItem.prototype.disable);
    this.emit("activationChange", this);
};

prototype.enableAll = function() {
    this.forEach(ActionMenuItem.prototype.enable);
    this.emit("activationChange", this);
};

prototype.disable = function(actions) {
    if (!Array.isArray(actions)) {
        actions = [actions];
    }

    actions.forEach(function(action) {
        this._idToItem[action].disable();
    }, this);
    this.emit("activationChange", this);
};

prototype.enable = function(actions) {
    if (!Array.isArray(actions)) {
        actions = [actions];
    }
    actions.forEach(function(action) {
        this._idToItem[action].enable();
    }, this);
    this.emit("activationChange", this);
};

export function ContextMenu(dom, opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    opts._initialLevel = 2;
    opts.rootClass = opts.rootClass ? opts.rootClass + " action-menu-context-root"
                                    : "action-menu-root action-menu-context-root";
    this._menu = new ActionMenu(opts);
    this._domNode = this._menu.$().css({
        position: "absolute",
        zIndex: 50
    });
    this._shown = false;
    this._targetDom = $(dom);
    this._x = 0;
    this._y = 0;
    this._xMax = 0;
    this._yMax = 0;
    this._delayTimerId = -1;

    this.documentClicked = this.documentClicked.bind(this);
    this.hide = this.hide.bind(this);
    this.rightClicked = this.rightClicked.bind(this);
    this.keypressed = this.keypressed.bind(this);
    this.position = this.position.bind(this);

    this.longTapRecognizer = this._menu.recognizerMaker.createLongTapRecognizer(this.rightClicked);
    this.documentTouchedRecognizer = this._menu.recognizerMaker.createTouchdownRecognizer(this.documentClicked);
    this.preventDefault = $.noop;

    this._targetDom.on("contextmenu", this.rightClicked);
    onCapture(document, "mousedown", this.documentClicked);
    this.longTapRecognizer.recognizeBubbledOn(this._targetDom);
    this.documentTouchedRecognizer.recognizeCapturedOn(document);
    document.addEventListener("keydown", this.keypressed, true);
    window.addEventListener("blur", this.hide, true);
    window.addEventListener("scroll", this.position, true);
    window.addEventListener("sizechange", this.position, true);

    this._menu.on("itemClick", this.hide);
    documentHidden.on("change", this.hide);
};
inherits(ContextMenu, EventEmitter);

ContextMenu.prototype.destroy = function() {
    this.hide();
    documentHidden.removeListener("change", this.hide);
    this._menu.removeListener("itemClick", this.hide);
    window.removeEventListener("blur", this.hide, true);
    window.removeEventListener("scroll", this.position, true);
    window.removeEventListener("sizechange", this.position, true);

    offCapture(document, "mousedown", this.documentClicked);
    this._targetDom.off("contextmenu", this.rightClicked);
    this.longTapRecognizer.unrecognizeBubbledOn(this._targetDom);
    this.documentTouchedRecognizer.unrecognizeCapturedOn(document);
    document.removeEventListener("keydown", this.keypressed, true);
    this.removeAllListeners();
    this._menu.destroy();
};

ContextMenu.prototype.$ = function() {
    return this._domNode;
};

ContextMenu.prototype.position = function() {
    if (!this._shown) return;
    var x = this._x;
    var y = this._y;
    var box = this.$()[0].getBoundingClientRect();
    var xMax = $(window).width();
    var yMax = $(window).height();

    var positionChanged = false;
    if (xMax !== this._xMax || yMax !== this._yMax) {
        x = x * (xMax / this._xMax);
        y = y * (yMax / this._yMax);
        this._x = x;
        this._y = y;
        this._xMax = xMax;
        this._yMax = yMax;
        positionChanged = true;
    }

    var origin = {x: 0, y: 0};

    if (x + box.width > xMax) {
        positionChanged = true;
        x = Math.max(0, xMax - box.width);
        origin.x = Math.max(0, this._x - x);
    }

    if (y + box.height > yMax) {
        positionChanged = true;
        y = Math.max(0, yMax - box.height);
        origin.y = Math.max(0, this._y - y);
    }

    this.$().css({left: x, top: y});

    if (positionChanged) {
        this._menu.forEach(function(child) {
            if (child.children) {
                child.positionSubMenu();
            }
        });
    }
    return origin;
};

ContextMenu.prototype.rightClicked = function(e) {
    this.hide();
    var defaultPrevented = false;
    var ev = {
        preventDefault: function() {defaultPrevented = true;},
        originalEvent: e
    };
    this.emit("beforeOpen", ev);
    if (defaultPrevented) return;
    this.show(e);
    if (this._shown) {
        e.preventDefault();
    }
};

ContextMenu.prototype.show = function(e) {
    if (this._shown) return;
    if (this._delayTimerId !== -1) {
        clearTimeout(this._delayTimerId);
        this._delayTimerId = -1;
    }
    var prevented = false;
    this.preventDefault = function() {prevented = true;};
    this.emit("willShowMenu", e, this);
    if (prevented) return;
    this._shown = true;
    this.$().removeClass("transition-out transition-in initial").appendTo("body");
    this._x = e.clientX;
    this._y = e.clientY;
    this._xMax = $(window).width();
    this._yMax = $(window).height();
    var origin = this.position();
    this.$().css(originProperty, origin.x + "px " + origin.y + "px 0px");

    // Transition from desktop right click feels weird so only do it on touch.
    if (isTouchEvent(e)) {
        this.$().detach();
        this.$().addClass("initial transition-in");
        this.$().appendTo("body");
        this.$().width();
        var self = this;
        changeDom(function() {
            self.$().removeClass("initial");
        });
    }

    this.emit("didShowMenu", e, this);
};

ContextMenu.prototype.hide = function() {
    if (!this._shown) return;
    this.emit("willHideMenu", this);
    this._shown = false;
    this.$().removeClass("transition-in").addClass("initial transition-out");
    this.$().width();
    var self = this;
    changeDom(function() {
        self.$().removeClass("initial");
        self._delayTimerId = setTimeout(function() {
            self._delayTimerId = -1;
            self.$().detach();
        }, TRANSITION_OUT_DURATION);
    });
    this._menu.hideContainer();
    this.emit("didHideMenu", this);
};

["disable", "enable", "disableAll", "enableAll", "refreshAll", "setEnabledStateFromPredicate",
"forEach"].forEach(function(methodName) {
    var menuMethod = prototype[methodName];
    ContextMenu.prototype[methodName] = function()  {
        return menuMethod.apply(this._menu, arguments);
    };
});

ContextMenu.prototype.documentClicked = function(e) {
    if (!this._shown) return;

    var $target = $(e.target);
    var containerClicked = false;
    this._menu.$containers().each(function() {
        if ($target.closest(this).length > 0) {
            containerClicked = true;
            return false;
        }
    });

    if (!containerClicked) {
        this.hide();
    }
};

ContextMenu.prototype.keypressed = function() {
    if (!this._shown) return;
    this.hide();
};
