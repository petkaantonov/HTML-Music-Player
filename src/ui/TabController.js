"use strict";

const util = require("lib/util");
const domUtil = require("lib/DomUtil");
const EventEmitter = require("lib/events");
const touch = require("features").touch;
const GlobalUi = require("ui/GlobalUi");

function Tab(spec, controller, index, opts) {
    EventEmitter.call(this);
    this._id = spec.id;
    this._domNode = $($(spec.tab)[0]);
    this._contentNode = $($(spec.content)[0]);
    this._controller = controller;
    this._index = index;
    this._active = false;
    this._clicked = this._clicked.bind(this);

    this.$().on("click", this._clicked);
    if (touch) {
        this.$().on(domUtil.TOUCH_EVENTS, domUtil.tapHandler(this._clicked));
    }
}
util.inherits(Tab, EventEmitter);

Tab.prototype.$ = function() {
    return this._domNode;
};

Tab.prototype.$content = function() {
    return this._contentNode;
};

Tab.prototype._clicked = function(e) {
    GlobalUi.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    this.emit("click", this);
};

Tab.prototype._relayout = function() {};

Tab.prototype.activate = function() {
    if (this._active) return;
    this._active = true;
    this.$().addClass("active");
};

Tab.prototype.isActive = function() {
    return this._active;
};

Tab.prototype.deactivate = function() {
    if (!this._active) return;
    this._active = false;
    this.$().removeClass("active");
};

function TabController(specs, opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this._tabClicked = this._tabClicked.bind(this);

    this._contentHideTimeoutId = -1;
    this._activeTab = null;
    this._tabs = specs.map(function(v, index) {
        var tab = new Tab(v, this, index, opts);
        tab.on("click", this._tabClicked);
        return tab;
    }, this);
    this._indicatorNode = $($(opts.indicator)[0]);

    this._relayout = this._relayout.bind(this);

    $(window).on("resize", this._relayout);
}
util.inherits(TabController, EventEmitter);

TabController.prototype.$indicator = function() {
    return this._indicatorNode;
};

TabController.prototype._clearContentHideTimeout = function() {
    if (this._contentHideTimeoutId !== -1) {
        clearTimeout(this._contentHideTimeoutId);
        this._contentHideTimeoutId = -1;
    }
};

TabController.prototype._relayout = function() {
    this._tabs.forEach(function(tab) {
        tab._relayout();
    });
};

TabController.prototype._tabClicked = function(tab) {
    this._activateTab(tab);
};

TabController.prototype._activateTab = function(tab) {
    if (tab === this._activeTab) return;
    this._clearContentHideTimeout();
    if (this._activeTab) {
        this._activeTab.deactivate();
        this.emit("tabWillDeactivate", this._activeTab._id);
    }
    this.emit("tabWillActivate", tab._id);
    this._activeTab = tab;
    tab.activate();

    var translate3d = "translate3d(" + (100 * tab._index) + "%, 0, 0)";
    domUtil.setTransform(this.$indicator(), translate3d);

    var activeIndex = this._activeTab._index;
    var self = this;
    this._tabs.forEach(function(tab) {
        var contentPosition = (tab._index - activeIndex) * 100;
        var translate3d = "translate3d(" + contentPosition + "%, 0, 0)";
        tab.$content().show().css("willChange", "transform");
        tab.$content().width();
        requestAnimationFrame(function() {
            domUtil.setTransform(tab.$content(), translate3d);
            self._contentHideTimeoutId = setTimeout(function() {
                self._contentHideTimeoutId = -1;
                if (!tab.isActive()) {
                    tab.$content().hide();
                }
                tab.$content().css("willChange", "none");
            }, 250);
        });
    });
};

TabController.prototype.activateTabById = function(id) {
    for (var i = 0; i < this._tabs.length; ++i) {
        if (this._tabs[i]._id === id) {
            return this._activateTab(this._tabs[i]);
        }
    }
    throw new Error("unknown id: " + id);
};


module.exports = TabController;
