"use strict";

import { inherits } from "lib/util";
import { TOUCH_EVENTS, horizontalDragHandler, setFilter, setTransform, tapHandler } from "lib/DomUtil";
import EventEmitter from "lib/events";
import { touch as touch } from "features";
import { rippler } from "ui/GlobalUi";

function Tab(spec, controller, index, opts) {
    EventEmitter.call(this);
    this._id = spec.id;
    this._domNode = $($(spec.tab)[0]);
    this._contentNode = $($(spec.content)[0]);
    this._controller = controller;
    this._index = index;
    this._active = false;
    this._clicked = this._clicked.bind(this);
    this._contentRect = this.$content()[0].getBoundingClientRect();
    this.$().on("click", this._clicked);
    if (touch) {
        this.$().on(TOUCH_EVENTS, tapHandler(this._clicked));
    }

    var position = this._contentRect.width * this._index;
    setTransform(this.$content(), "translate3d("+position+"px, 0px, 0px)");
}
inherits(Tab, EventEmitter);

Tab.prototype.$ = function() {
    return this._domNode;
};

Tab.prototype.$content = function() {
    return this._contentNode;
};

Tab.prototype._clicked = function(e) {
    rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    this.emit("click", this);
};

Tab.prototype._relayout = function() {
    this.updateRectCache();
};

Tab.prototype.updateRectCache = function() {
    this._contentRect = this.$content()[0].getBoundingClientRect();
};

Tab.prototype.index = function() {
    return this._index;
};

Tab.prototype.contentRect = function() {
    return this._contentRect;
};

Tab.prototype.activate = function() {
    if (this._active) return;
    this._active = true;
};

Tab.prototype.prepareForSetColor = function() {
    this.$().removeClass("no-transition").width();
};

Tab.prototype.setColor = function() {
    if (this.isActive()) {
        setFilter(this.$(), "grayscale(0%) brightness(100%)");
    } else {
        setFilter(this.$(), "grayscale(100%) brightness(60%)");
    }
};

Tab.prototype.isActive = function() {
    return this._active;
};

Tab.prototype.deactivate = function() {
    if (!this._active) return;
    this._active = false;
};

function TabController(domNode, specs, opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this._domNode = $($(domNode)[0]);
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

    $(window).on("sizechange", this._relayout);

    this._dragStart = this._dragStart.bind(this);
    this._dragMove = this._dragMove.bind(this);
    this._dragEnd = this._dragEnd.bind(this);
    this._dragStartTime = -1;
    this._dragAnchorStart = -1;
    this._dragAnchorEnd = -1;
    this._activeTabRect = null;

    if (touch) {
        this.$().on(TOUCH_EVENTS, horizontalDragHandler(this._dragStart,
                                                                        this._dragMove,
                                                                        this._dragEnd));
    }
}
inherits(TabController, EventEmitter);

TabController.prototype.$ = function() {
    return this._domNode;
};

TabController.prototype.$indicator = function() {
    return this._indicatorNode;
};

TabController.prototype._dragStart = function(gesture) {
    this._dragAnchorStart = gesture.clientX;
    this._dragStartTime = gesture.timeStamp;

    this.$indicator().addClass("no-transition").css("willChange", "transform");

    for (var i = 0; i < this._tabs.length; ++i) {
        var tab = this._tabs[i];
        tab.$content().show().addClass("no-transition").css("willChange", "transform");
        tab.$().addClass("no-transition");//.css("willChange", "-webkit-filter");
        tab.updateRectCache();
    }
    this._activeTabRect = this._activeTab.contentRect();
};

TabController.prototype._dragMove = function(gesture) {
    var deltaX = -1 * (this._dragAnchorStart - gesture.clientX);
    var activeIndex = this._activeTab.index();

    if ((activeIndex === 0 && deltaX > 0) ||
        (activeIndex === this._tabs.length - 1 && deltaX < 0)) {
        return;
    }

    var contentWidth = this._activeTabRect.width;
    var progress = deltaX / contentWidth;
    var absProgress = Math.min(1, Math.abs(progress) / 0.40);
    var nextIndex;

    if (deltaX < 0) {
        var nextIndex = activeIndex + 1;
    } else {
        var nextIndex = activeIndex - 1;
    }

    for (var i = 0; i < this._tabs.length; ++i) {
        var tab = this._tabs[i];
        var newPosition = ((i - activeIndex) + progress) * contentWidth;
        var translate3d = "translate3d(" + newPosition + "px, 0, 0)";
        setTransform(tab.$content(), translate3d);

        if (i === activeIndex) {
            var brightness = ((1 - absProgress) * (100 - 60) + 60);
            var grayscale = ((absProgress) * 100);
            setFilter(tab.$(), "grayscale("+grayscale+"%) brightness("+brightness+"%)");
        } else if (i === nextIndex) {
            var brightness = (absProgress * (100 - 60) + 60);
            var grayscale = ((1 - absProgress) * 100);
            setFilter(tab.$(), "grayscale("+grayscale+"%) brightness("+brightness+"%)");
        } else {
            setFilter(tab.$(), "grayscale(100%) brightness(60%)");
        }
    }
    setTransform(this.$indicator(), "translate3d(" + ((activeIndex * 100) + (-1 * progress * 100))+ "%, 0, 0)");
    this._dragAnchorEnd = gesture.clientX;
};

TabController.prototype._dragEnd = function(gesture) {
    var delta = (this._dragAnchorEnd - this._dragAnchorStart) / this._activeTabRect.width;
    var elapsed = gesture.timeStamp - this._dragStartTime;
    var speed = delta / elapsed * 1000;

    var newTab;
    if ((delta < -0.40 || speed < -1.2) && this._activeTab.index() < this._tabs.length - 1) {
        newTab = this._tabs[this._activeTab.index() + 1];
    } else if ((delta > 0.40 || speed > 1.2) && this._activeTab.index() > 0) {
        newTab = this._tabs[this._activeTab.index() - 1];
    } else {
        newTab = this._activeTab;
    }

    this._activateTab(newTab, true);
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
    this._activeTabRect = this._activeTab.contentRect();
};

TabController.prototype._tabClicked = function(tab) {
    this._activateTab(tab);
};

TabController.prototype._activateTab = function(tab, force) {
    var initialTabActivation = !this._activeTab;

    if (!this._activeTabRect) {
        this._activeTabRect = tab.contentRect();
    }

    var willChangeTabs = tab !== this._activeTab;
    if (!willChangeTabs && !force) return;
    this._clearContentHideTimeout();

    var previousActiveTabId;
    var newActiveTabId;

    if (willChangeTabs) {
        if (this._activeTab) {
            previousActiveTabId = this._activeTab._id;
            this._activeTab.deactivate();
            this.emit("tabWillDeactivate", this._activeTab._id);
        }
        this.emit("tabWillActivate", tab._id);
        this._activeTab = tab;
        newActiveTabId = tab._id;
        tab.activate();
    }

    var activeIndex = this._activeTab.index();
    var self = this;
    var contentWidth = this._activeTabRect.width;

    if (!initialTabActivation) {
        this.$indicator().removeClass("no-transition").css("willChange", "transform").width();
        for (var i = 0; i < this._tabs.length; ++i) {
            var tab = this._tabs[i];
            tab.$content().removeClass("no-transition").show().css("willChange", "transform");
            tab.$content().width();
            tab.prepareForSetColor();
        }
    }

    for (var i = 0; i < this._tabs.length; ++i) {
        var tab = this._tabs[i];
        tab.setColor();
        var contentPosition = (tab.index() - activeIndex) * contentWidth;
        setTransform(tab.$content(), "translate3d(" + contentPosition + "px, 0, 0)");
    }
    setTransform(this.$indicator(), "translate3d(" + (100 * activeIndex) + "%, 0, 0)");

    self._contentHideTimeoutId = setTimeout(function() {
        self._contentHideTimeoutId = -1;
        for (var i = 0; i < self._tabs.length; ++i) {
            var tab = self._tabs[i];
            if (!tab.isActive()) {
                tab.$content().hide();
            }
            tab.$content().css("willChange", "");
        }

        self.$indicator().css("willChange", "");

        if (previousActiveTabId) {
            self.emit("tabDidDeactivate", previousActiveTabId);
        }
        if (newActiveTabId) {
            self.emit("tabDidActivate", newActiveTabId);
        }
    }, 330);

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
