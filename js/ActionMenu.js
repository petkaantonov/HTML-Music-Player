"use strict";
const $ = require("../lib/jquery");
const util = require("./util");
const EventEmitter = require("events");
const NULL = $(null);
const touch = require("./features").touch;
const domUtil = require("./DomUtil");
const GlobalUi = require("./GlobalUi");

const TRANSITION_OUT_DURATION = 200;

function ActionMenuItem(root, spec, children, level) {
    this.root = root;
    this.parent = null;
    this.children = children;
    this.id = spec.id;
    this.divider = !!spec.divider;
    this.disabled = !!spec.disabled;
    this.handler = typeof spec.onClick === "function" ? spec.onClick : $.noop;

    this._preferredHorizontalDirection = "right";
    this._preferredVerticalDirection = "down";
    this._delayTimerId = -1;
    this._content = util.toFunction(spec.content);
    this._containerDom = NULL;
    this._domNode = this._createDom(this._content(this) + "");

    if (this.disabled) this.$().addClass(this.root.disabledClass);

    this.itemMouseEntered = this.itemMouseEntered.bind(this);
    this.itemMouseLeft = this.itemMouseLeft.bind(this);
    this.containerMouseEntered = this.containerMouseEntered.bind(this);
    this.containerMouseLeft = this.containerMouseLeft.bind(this);
    this.itemClicked = this.itemClicked.bind(this);
    this.positionSubMenu = this.positionSubMenu.bind(this);
    this.itemTouchStarted = this.itemTouchStarted.bind(this);

    if (this.children) {
        this._containerDom = this._createContainerDom(level);
        this.children.forEach(function(child) {
            child.setParent(this);
        }, this);

        this.$().on("mouseenter", this.itemMouseEntered);
        this.$().on("mouseleave", this.itemMouseLeft);
        this.$container().on("mouseenter", this.containerMouseEntered);
        this.$container().on("mouseleave", this.containerMouseLeft);

        if (touch) {
            this.$container().on(domUtil.TOUCH_EVENTS_NO_MOVE, domUtil.touchDownHandler(this.containerMouseEntered));
        }
    }

    if (!this.divider) {
        this.$().on("click", this.itemClicked);

        if (touch) {
            this.$().on(domUtil.TOUCH_EVENTS, domUtil.tapHandler(this.itemClicked));
            this.$().on(domUtil.TOUCH_EVENTS_NO_MOVE, domUtil.touchDownHandler(this.itemTouchStarted));
        }
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
    GlobalUi.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, this.zIndex() + 1);
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
        GlobalUi.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, this.zIndex() + 1);
        return;
    }
    if (this.children) {
        this._clearDelayTimer();
        this.showContainer();
    } else {
        var prevented = false;
        try {
            this.handler({preventDefault: function() {prevented = true;}});
        } finally {
            if (!prevented) {
                this.root.hideContainer();
                this.root.emit("itemClick", this.id);
            } else {
                GlobalUi.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, this.zIndex() + 1);
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
        zIndex: level * 100000
    });
};

ActionMenuItem.prototype._createDom = function(content) {
    if (this.divider) {
        return $('<div>', {class: this.root.dividerClass});
    } else {
        return $('<div>', {class: this.root.itemClass}).html(content);
    }
};

ActionMenuItem.prototype.refresh = function() {
    if (this.divider || !this.isShown()) return;
    this.$().html(this._content(this) + "");
    if (this.parent) this.parent.positionSubMenu();
};

ActionMenuItem.prototype.setParent = function(parent) {
    this.parent = parent;
    this.$().appendTo(this.parent.$container());
    this.parent.$().addClass("action-menu-sub-menu-item");
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

ActionMenuItem.prototype.positionSubMenu = function() {
    if (!this.isShown()) return;
    var itemBox = this.$()[0].getBoundingClientRect();
    var containerBox = this.$container()[0].getBoundingClientRect();
    var xMax = $(window).width();
    var yMax = $(window).height();
    // Fits within the viewport
    var origin = {x: 0, y: 0};
    if (xMax > containerBox.width && yMax > containerBox.height) {
        var left = -1;
        var top = -1;

        var preferredDirection = this.getHorizontalDirection();

        while (left < 0 || left + containerBox.width > xMax) {
            if (preferredDirection === "right") {
                left = Math.max(0, itemBox.right - 3);

                if (left + containerBox.width > xMax) {
                    left = xMax - containerBox.width;
                    preferredDirection = "left";
                }
            } else {
                left = itemBox.left + 3 - containerBox.width;

                if (left < 0) {
                    left = 0;
                    preferredDirection = "right";
                }
            }
        }
        this._preferredHorizontalDirection = preferredDirection;

        preferredDirection = this.getVerticalDirection();

        while (top < 0 || top + containerBox.height > yMax) {
            if (preferredDirection === "down") {
                top = Math.max(0, itemBox.top + 3);

                if (top + containerBox.height > yMax) {
                    top = yMax - containerBox.height;
                    preferredDirection = "up";
                }
            } else {
                top = itemBox.bottom - 3 - containerBox.height;

                if (top < 0) {
                    top = 0;
                    preferredDirection = "down";
                } else if (top + containerBox.height > yMax) {
                    top = yMax - containerBox.height;
                }
            }
        }
        this._preferredVerticalDirection = preferredDirection;

        this.$container().css({
            top: top,
            left: left
        });

        origin.x = this._preferredHorizontalDirection === "right" ? 0 : containerBox.width;
        origin.y = this._preferredVerticalDirection === "down" ? 0
                                                               : Math.max(itemBox.top - top, 0);
    }
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
    this.$container().removeClass("transition-out transition-in initial").appendTo("body");
    var origin = this.positionSubMenu();
    this.$container().css(domUtil.originProperty, origin.x + "px " + origin.y + "px 0px");
    this.$container().detach();
    this.$container().removeClass("transition-out").addClass("initial transition-in");
    this.$container().appendTo("body");
    this.$container().width();
    var self = this;
    domUtil.changeDom(function() {
        self.$container().removeClass("initial");
    });
};

ActionMenuItem.prototype.hideContainer = function() {
    this._preferredVerticalDirection = "down";
    this._preferredHorizontalDirection = "right";
    this._clearDelayTimer();
    this.$container().removeClass("transition-in").addClass("initial transition-out");
    this.$container().width();
    var self = this;
    domUtil.changeDom(function() {
        self.$container().removeClass("initial");
        self._delayTimerId = setTimeout(function() {
            self._delayTimerId = -1;
            self.$container().detach();
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

function ActionMenu(opts) {
    EventEmitter.call(this);
    opts = Object(opts);

    this.rootClass = opts.rootClass || "action-menu-root";
    this.containerClass = opts.containerClass || "action-menu-submenu";
    this.itemClass = opts.itemClass || "action-menu-item";
    this.disabledClass = opts.disabledClass || "action-menu-disabled";
    this.dividerClass = opts.dividerClass || "action-menu-divider";
    this.activeSubMenuClass = opts.activeSubMenuClass || "action-menu-active";
    this.showDelay = Math.min(1000, Math.max(0, +opts.subMenuShowDelay || 300));
    this.hideDelay = Math.min(3000, Math.max(0, +opts.subMenuHideDelay || 800));


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
util.inherits(ActionMenu, EventEmitter);

ActionMenu.prototype.destroy = function() {
    this.clearDelayTimer();
    this.forEach(function(child) { child.destroy(); });
    this.hideContainer();
    this.$().remove();
    this.removeAllListeners();
};

ActionMenu.prototype.menuItemTouchStarted = function(child) {
    for (var i = 0; i < this._menuItems.length; ++i) {
        var otherChild = this._menuItems[i];
        if (child !== otherChild) {
            otherChild.removeActiveClass();
            otherChild.hideContainer();
        }
    }
};

ActionMenu.prototype.$containers = function() {
    var ret = this.$();
    this.forEach(function(item) {
        if (item.children && item.isShown())  {
            ret = ret.add(item.$container()[0]);
        }
    });
    return ret;
};

ActionMenu.prototype.$ = function() {
    return this._domNode;
};

ActionMenu.prototype.clearDelayTimer = function() {
    if (this._delayTimerId !== -1) {
        clearTimeout(this._delayTimerId);
        this._delayTimerId = -1;
    }
};

ActionMenu.prototype.startHideTimer = function() {
    this.clearDelayTimer();
    var self = this;
    this._delayTimerId = setTimeout(function() {
        self._delayTimerId = -1;
        self.hideContainer();
    }, this.hideDelay);
};

ActionMenu.prototype.hideContainer = function() {
    this._menuItems.forEach(function(item) {
        item.hideContainer();
    });
};

ActionMenu.prototype.forEach = function(fn, ctx) {
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

ActionMenu.prototype.refreshAll = function() {
    this.forEach(ActionMenuItem.prototype.refresh);
};

ActionMenu.prototype.disableAll = function() {
    this.forEach(ActionMenuItem.prototype.disable);
    this.emit("activationChange", this);
};

ActionMenu.prototype.enableAll = function() {
    this.forEach(ActionMenuItem.prototype.enable);
    this.emit("activationChange", this);
};

ActionMenu.prototype.disable = function(actions) {
    if (!Array.isArray(actions)) {
        actions = [actions];
    }

    actions.forEach(function(action) {
        this._idToItem[action].disable();
    }, this);
    this.emit("activationChange", this);
};

ActionMenu.prototype.enable = function(actions) {
    if (!Array.isArray(actions)) {
        actions = [actions];
    }
    actions.forEach(function(action) {
        this._idToItem[action].enable();
    }, this);
    this.emit("activationChange", this);
};

ActionMenu.ContextMenu = function ContextMenu(dom, opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    opts._initialLevel = 2;
    opts.rootClass = opts.rootClass ? opts.rootClass + " action-menu-context-root"
                                    : "action-menu-root action-menu-context-root";
    this._menu = new ActionMenu(opts);
    this._domNode = this._menu.$().css({
        position: "absolute",
        zIndex: 1
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
    this.rightClickedTouch = domUtil.longTapHandler(this.rightClicked);
    this.documentClickedTouch = domUtil.touchDownHandler(this.documentClicked);

    this.preventDefault = $.noop;

    // Use event capturing so that these are handled even if stopPropagation()
    // is called.
    this._targetDom.on("contextmenu", this.rightClicked);
    util.onCapture(document, "mousedown", this.documentClicked);

    if (touch) {
        this._targetDom.on(domUtil.TOUCH_EVENTS, this.rightClickedTouch);
        util.onCapture(document, domUtil.TOUCH_EVENTS, this.documentClickedTouch);
    }

    document.addEventListener("keydown", this.keypressed, true);
    window.addEventListener("blur", this.hide, true);
    window.addEventListener("scroll", this.position, true);
    window.addEventListener("resize", this.position, true);

    this._menu.on("itemClick", this.hide);
    util.documentHidden.on("change", this.hide);
};
util.inherits(ActionMenu.ContextMenu, EventEmitter);

ActionMenu.ContextMenu.prototype.destroy = function() {
    this.hide();
    util.documentHidden.removeListener("change", this.hide);
    this._menu.removeListener("itemClick", this.hide);
    window.removeEventListener("blur", this.hide, true);
    window.removeEventListener("scroll", this.position, true);
    window.removeEventListener("resize", this.position, true);
    
    util.offCapture(document, "mousedown", this.documentClicked);
    this._targetDom.off("contextmenu", this.rightClicked);

    if (touch) {
        util.offCapture(document, domUtil.TOUCH_EVENTS, this.documentClickedTouch);
        this._targetDom.off(domUtil.TOUCH_EVENTS, this.rightClickedTouch);
    }

    document.removeEventListener("keydown", this.keypressed, true);
    this.removeAllListeners();
    this._menu.destroy();
};

ActionMenu.ContextMenu.prototype.$ = function() {
    return this._domNode;
};

ActionMenu.ContextMenu.prototype.position = function() {
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

ActionMenu.ContextMenu.prototype.rightClicked = function(e) {
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

ActionMenu.ContextMenu.prototype.show = function(e) {
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
    this.$().css(domUtil.originProperty, origin.x + "px " + origin.y + "px 0px");
    this.$().detach();
    this.$().removeClass("transition-out").addClass("initial transition-in");
    this.$().appendTo("body");
    this.$().width();
    var self = this;
    domUtil.changeDom(function() {
        self.$().removeClass("initial");
    });
    this.emit("didShowMenu", e, this);
};

ActionMenu.ContextMenu.prototype.hide = function() {
    if (!this._shown) return;
    this._shown = false;
    this.$().removeClass("transition-in").addClass("initial transition-out");
    this.$().width();
    var self = this;
    domUtil.changeDom(function() {
        self.$().removeClass("initial");
        self._delayTimerId = setTimeout(function() {
            self._delayTimerId = -1;
            self.$().detach();
        }, TRANSITION_OUT_DURATION);
    });
    this._menu.hideContainer();
};

["disable", "enable", "disableAll", "enableAll", "refreshAll",
"forEach"].forEach(function(methodName) {
    var menuMethod = ActionMenu.prototype[methodName];
    ActionMenu.ContextMenu.prototype[methodName] = function()  {
        return menuMethod.apply(this._menu, arguments);
    };
});

ActionMenu.ContextMenu.prototype.documentClicked = function(e) {
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

ActionMenu.ContextMenu.prototype.keypressed = function() {
    if (!this._shown) return;
    this.hide();
};

module.exports = ActionMenu;
