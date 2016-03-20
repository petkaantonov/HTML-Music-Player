"use strict";

export default function OpenableSubmenu(dom, opener, opts) {
    opts = Object(opts);
    this._page = opts.page;
    this._recognizerContext = opts.recognizerContext;
    this._rippler = opts.rippler;
    this._domNode = this._page.$(dom).eq(0);
    this._opener = this._page.$(opener).eq(0);

    this._keyboardElements = this.$().find("*").filter(function(elem) {
        return elem.tabIndex >= 0;
    });

    this._opened = false;

    this.activeClass = opts.activeClass || "shown";
    this.transitionClass = opts.transitionClass || "transition-in";
    this.openerActiveClass = opts.openerActiveClass || "opener-active";

    this._openerFocused = this._openerFocused.bind(this);
    this._openerClicked = this._openerClicked.bind(this);
    this._documentClicked = this._documentClicked.bind(this);
    this._documentTapRecognizer = this._recognizerContext.createTapRecognizer(this._documentClicked);

    this._keydowned = this._keydowned.bind(this);
    this._elementBlurred = this._elementBlurred.bind(this);

    this.$opener().addEventListener("click", this._openerClicked)
                  .addEventListener("focus", this._openerFocused);
    this._recognizerContext.createTapRecognizer(this._openerClicked).recognizeBubbledOn(this.$opener());

    this._page.addDocumentListener("blur", this._elementBlurred, true);
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
    this.$().addClass(this.activeClass).forceReflow();
    var self = this;
    this._page.addDocumentListener("keydown", this._keydowned, true);
    this._page.addDocumentListener("click", this._documentClicked, true);
    this._page.changeDom(function() {
        self.$().addClass(self.transitionClass);
    });
    this._documentTapRecognizer.recognizeCapturedOn(this._page.document());
};

OpenableSubmenu.prototype.close = function() {
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

OpenableSubmenu.prototype._documentClicked = function(e) {
    if (!this._opened) return;
    var $target = this._page.$(e.target);
    if ($target.closest(this.$().add(this.$opener())).length === 0) {
        this.close();
    }
};

OpenableSubmenu.prototype._openerFocused = function() {
    this.open();
};

OpenableSubmenu.prototype._elementBlurred = function(e) {
    if (!this._opened) return;
    var $newFocus = this._page.$(e.relatedTarget);
    if ($newFocus.closest(this.$().add(this.$opener())).length === 0) {
        this.close();
    }
};

OpenableSubmenu.prototype._openerClicked = function(e) {
    this.open();
};

OpenableSubmenu.prototype._keydowned = function(e) {
    var activeElement = this._page.activeElement();
    if (!activeElement) return;
    var key = e.key;



    if (key === "ArrowUp" || key === "ArrowDown") {
        var activeIndex = -1;

        this._keyboardElements.forEach(function(elem, index) {
            if (elem === activeElement) {
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
