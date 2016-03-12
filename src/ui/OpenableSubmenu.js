"use strict";

import { offCapture, onCapture } from "lib/util";
import { TOUCH_EVENTS, tapHandler } from "lib/DomUtil";

export default function OpenableSubmenu(dom, opener, opts) {
    opts = Object(opts);
    this._env = opts.env;
    this._rippler = opts.rippler;
    this._domNode = $($(dom)[0]);
    this._opener = $($(opener)[0]);
    this._keyboardElements = this.$().find("*").filter(function() {
        return this.tabIndex >= 0;
    });

    this._opened = false;

    this.activeClass = opts.activeClass || "shown";
    this.transitionClass = opts.transitionClass || "transition-in";
    this.openerActiveClass = opts.openerActiveClass || "opener-active";

    this._openerFocused = this._openerFocused.bind(this);
    this._openerClicked = this._openerClicked.bind(this);
    this._documentClicked = this._documentClicked.bind(this);
    this._documentTapped = tapHandler(this._documentClicked);

    this._keydowned = this._keydowned.bind(this);
    this._elementBlurred = this._elementBlurred.bind(this);

    if (this._env.hasTouch()) {
        this.$opener().on(TOUCH_EVENTS, tapHandler(this._openerClicked));
    }

    this.$opener().on("click", this._openerClicked)
                  .on("focus", this._openerFocused);

    onCapture(document, "blur", this._elementBlurred);
}

OpenableSubmenu.prototype.$ = function() {
    return this._domNode;
};

OpenableSubmenu.prototype.$opener = function() {
    return this._opener;
};

OpenableSubmenu.prototype.open = function() {
    if (this._opened) return;
    this._opened = true;
    this.$opener().addClass(this.openerActiveClass);
    this.$().addClass(this.activeClass);
    this.$().width();
    var self = this;
    onCapture(document, "keydown", this._keydowned);
    requestAnimationFrame(function() {
        self.$().addClass(self.transitionClass);
    });
    onCapture(document, "click", this._documentClicked);

    if (this._env.hasTouch()) {
        onCapture(document, TOUCH_EVENTS, this._documentTapped);
    }
};

OpenableSubmenu.prototype.close = function() {
    if (!this._opened) return;
    this._opened = false;
    if ($(document.activeElement).closest(this.$().add(this.$opener())).length > 0) {
        document.activeElement.blur();
    }
    offCapture(document, "keydown", this._keydowned);
    this.$opener().removeClass(this.openerActiveClass);
    this.$().removeClass(this.activeClass).removeClass(this.transitionClass);
    offCapture(document, "click", this._documentClicked);
    if (this._env.hasTouch()) {
        offCapture(document, TOUCH_EVENTS, this._documentTapped);
    }
};

OpenableSubmenu.prototype._documentClicked = function(e) {
    if (!this._opened) return;
    var $target = $(e.target);
    if ($target.closest(this.$().add(this.$opener())).length === 0) {
        this.close();
    }
};

OpenableSubmenu.prototype._openerFocused = function() {
    this.open();
};

OpenableSubmenu.prototype._elementBlurred = function(e) {
    if (!this._opened) return;
    var $newFocus = $(e.relatedTarget);
    if ($newFocus.closest(this.$().add(this.$opener())).length === 0) {
        this.close();
    }
};

OpenableSubmenu.prototype._openerClicked = function(e) {
    this._rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    this.open();
};

OpenableSubmenu.prototype._keydowned = function(e) {
    var activeElement = document.activeElement;
    if (!activeElement) return;
    var key = e.key;

    if (key === "ArrowUp" || key === "ArrowDown") {
        var activeIndex = -1;

        this._keyboardElements.each(function(index) {
            if (this === activeElement) {
                activeIndex = index;
                return false;
            }
        });

        if (activeIndex === -1) {
            this._keyboardElements[0].focus();
        } else {
            activeIndex += (key === "ArrowUp" ? -1 : 1);
            activeIndex = Math.min(this._keyboardElements.length - 1, Math.max(0, activeIndex));
            this._keyboardElements[activeIndex].focus();
        }
    }
};
