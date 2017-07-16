import {slugTitle} from "util";
import ActionMenu, {ContextMenu, ButtonMenu, VirtualButtonMenu} from "ui/ActionMenu";
import withDeps from "ApplicationDependencies";

export default function MenuContext(opts, deps) {
    this.rootClass = opts.rootClass;
    this.containerClass = opts.containerClass;
    this.itemClass = opts.itemClass;
    this.disabledClass = opts.disabledClass;
    this.dividerClass = opts.dividerClass;
    this.activeSubMenuClass = opts.activeSubMenuClass;
    this.subMenuShowDelay = opts.subMenuShowDelay;
    this.subMenuHideDelay = opts.subMenuHideDelay;
    this.menuItemIconContainerClass = opts.menuItemIconContainerClass;
    this.menuItemIconClass = opts.menuItemIconClass;
    this.menuItemContentClass = opts.menuItemContentClass;
    this.menuItemTextClass = opts.menuItemTextClass;

    this.page = deps.page;
    this.rippler = deps.rippler;
    this.recognizerContext = deps.recognizerContext;
    this.globalEvents = deps.globalEvents;
}

MenuContext.prototype._copyOpts = function(opts) {
    opts.rootClass = this.rootClass;
    opts.containerClass = this.containerClass;
    opts.itemClass = this.itemClass;
    opts.disabledClass = this.disabledClass;
    opts.dividerClass = this.dividerClass;
    opts.activeSubMenuClass = this.activeSubMenuClass;
    opts.subMenuShowDelay = this.subMenuShowDelay;
    opts.subMenuHideDelay = this.subMenuHideDelay;
};

MenuContext.prototype._construct = function(opts, Constructor) {
    this._copyOpts(opts);
    return withDeps({
        page: this.page,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler,
        globalEvents: this.globalEvents
    }, deps => new Constructor(opts, deps));
};

MenuContext.prototype.createActionMenu = function(opts) {
    return this._construct(opts, ActionMenu);
};

MenuContext.prototype.createContextMenu = function(opts) {
    return this._construct(opts, ContextMenu);
};

MenuContext.prototype.createButtonMenu = function(opts) {
    return this._construct(opts, ButtonMenu);
};

MenuContext.prototype.createVirtualButtonMenu = function(opts) {
    return this._construct(opts, VirtualButtonMenu);
};

MenuContext.prototype.createMenuItem = function(text, icon) {
    const content = this.page.createElement(`div`, {
        class: `${this.menuItemContentClass} ${slugTitle(text)}`
    });

    const iconContainer = this.page.createElement(`div`, {
        class: this.menuItemIconContainerClass
    });
    if (icon) {
        iconContainer.append(this.page.createElement(`span`, {
            class: `${this.menuItemIconClass} ${icon}`
        }));
    }

    const textContainer = this.page.createElement(`div`, {
        class: this.menuItemTextClass
    }).setText(text);

    content.append(iconContainer).append(textContainer);

    return content;
};
