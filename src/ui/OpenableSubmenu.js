"use strict";

import { ensuredObjectField, ensuredStringField } from "util";

export default function OpenableSubmenu(opts, deps) {
    opts = Object(opts);
    this._globalEvents = deps.globalEvents;
    this._page = deps.page;
    this._recognizerContext = deps.recognizerContext;
    this._rippler = deps.rippler;

    this._domNode = this._page.$(ensuredStringField(opts, "target")).eq(0);
    this._opener = this._page.$(ensuredStringField(opts, "openerTarget")).eq(0);
    this.activeClass = ensuredStringField(opts, "activeClass");
    this.transitionClass = ensuredStringField(opts, "transitionClass");
    this.openerActiveClass = ensuredStringField(opts, "openerActiveClass");

    this._keyboardElements = this.$().find("*").filter(function(elem) {
        return elem.tabIndex >= 0;
    });

    this._opened = false;

    this._open = this._open.bind(this);
    this._close = this._close.bind(this);

    this._openerMousedowned = this._openerMousedowned.bind(this);
    this._openerFocused = this._openerFocused.bind(this);
    this._openerClicked = this._openerClicked.bind(this);
    this._documentClicked = this._documentClicked.bind(this);
    this._documentTapRecognizer = this._recognizerContext.createTapRecognizer(this._documentClicked);

    this._keydowned = this._keydowned.bind(this);
    this._elementBlurred = this._elementBlurred.bind(this);

    this.$opener().addEventListener("click", this._openerClicked)
                  .addEventListener("mousedown", this._openerMousedowned)
                  .addEventListener("focus", this._openerFocused);
    this._recognizerContext.createTapRecognizer(this._openerClicked).recognizeBubbledOn(this.$opener());
    this._globalEvents.on("visibilityChange", this._close);
    this._page.addDocumentListener("blur", this._elementBlurred, true);
    deps.ensure();
}

OpenableSubmenu.prototype.$ = function() {
    return this._domNode;
};

OpenableSubmenu.prototype.$opener = function() {
    return this._opener;
};

OpenableSubmenu.prototype._open = function() {
    if (this._opened) return;
    this._opened = true;
    this.$opener().addClass(this.openerActiveClass);
    this.$().addClass(this.activeClass).forceReflow();
    var self = this;
    this._page.addDocumentListener("keydown", this._keydowned, true);
    this._page.addDocumentListener("click", this._documentClicked, true);
    this._page.changeDom(function() {
        self.$().addClass(self.transitionClass);
    });
    this._documentTapRecognizer.recognizeCapturedOn(this._page.document());
};

OpenableSubmenu.prototype._close = function() {
    if (!this._opened) return;
    this._opened = false;
    if (this._page.$(this._page.activeElement()).closest(this.$().add(this.$opener())).length > 0) {
        this._page.activeElement().blur();
    }
    this._page.removeDocumentListener("keydown", this._keydowned, true);
    this._page.removeDocumentListener("click", this._documentClicked, true);

    this.$opener().removeClass(this.openerActiveClass);
    this.$().removeClass(this.activeClass)
            .removeClass(this.transitionClass);

    this._documentTapRecognizer.unrecognizeCapturedOn(this._page.document());
};

OpenableSubmenu.prototype.open = function() {
    if (this._opened) return;
    this._open();
};

OpenableSubmenu.prototype.close = function() {
    if (!this._opened) return;
    this._close();
};

OpenableSubmenu.prototype._documentClicked = function(e) {
    if (!this._opened) return;
    var $target = this._page.$(e.target);
    if ($target.closest(this.$().add(this.$opener())).length === 0) {
        this.close();
    }
};

OpenableSubmenu.prototype._openerFocused = function(e) {
    this.open();
};

OpenableSubmenu.prototype._elementBlurred = function(e) {
    if (!this._opened) return;
    var $newFocus = this._page.$(e.relatedTarget);
    if ($newFocus.closest(this.$().add(this.$opener())).length === 0) {
        this.close();
    }
};

OpenableSubmenu.prototype.toggle = function() {
    if (this._opened) {
        this.close();
    } else {
        this.open();
    }
};

OpenableSubmenu.prototype._openerClicked = function(e) {
    if (this._page.isRealClickOrTap(e)) {
        this._rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        this.toggle();
    } else {
        this.open();
    }
};

OpenableSubmenu.prototype._openerMousedowned = function(e) {
    e.preventDefault();
};

OpenableSubmenu.prototype._keydowned = function(e) {
    var activeElement = this._page.activeElement();
    if (!activeElement) return;
    var key = e.key;

    var activeIndex = -1;

    this._keyboardElements.forEach(function(elem, index) {
        if (elem === activeElement) {
            activeIndex = index;
            return false;
        }
    });

    if (key === "ArrowUp" || key === "ArrowDown") {

        if (activeIndex === -1) {
            this._keyboardElements[0].focus();
        } else {
            activeIndex += (key === "ArrowUp" ? -1 : 1);
            activeIndex = Math.min(this._keyboardElements.length - 1, Math.max(0, activeIndex));
            this._keyboardElements[activeIndex].focus();
        }
    } else if (key === " ") {
        if (activeIndex >= 0) {
            this._keyboardElements[activeIndex].click();
        }
    }
};
