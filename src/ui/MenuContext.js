"use strict";

import { slugTitle } from "util";
import ActionMenu, { ContextMenu } from "ui/ActionMenu";
import ApplicationDependencies from "ApplicationDependencies";

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
    deps.ensure();
}

MenuContext.prototype.createActionMenu = function(opts) {
    opts.rootClass = this.rootClass;
    opts.containerClass = this.containerClass;
    opts.itemClass = this.itemClass;
    opts.disabledClass = this.disabledClass;
    opts.dividerClass = this.dividerClass;
    opts.activeSubMenuClass = this.activeSubMenuClass;
    opts.subMenuShowDelay = this.subMenuShowDelay;
    opts.subMenuHideDelay = this.subMenuHideDelay;
    return new ActionMenu(opts, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler,
        globalEvents: this.globalEvents
    }));
};

MenuContext.prototype.createContextMenu = function(opts) {
    opts.rootClass = this.rootClass;
    opts.containerClass = this.containerClass;
    opts.itemClass = this.itemClass;
    opts.disabledClass = this.disabledClass;
    opts.dividerClass = this.dividerClass;
    opts.activeSubMenuClass = this.activeSubMenuClass;
    opts.subMenuShowDelay = this.subMenuShowDelay;
    opts.subMenuHideDelay = this.subMenuHideDelay;
    return new ContextMenu(opts, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler,
        globalEvents: this.globalEvents
    }));
};

MenuContext.prototype.createMenuItem = function(text, icon) {
    var content = this.page.createElement("div", {
        class: this.menuItemContentClass + " " + slugTitle(text)
    });

    var iconContainer = this.page.createElement("div", {
        class: this.menuItemIconContainerClass
    });
    if (icon) {
        iconContainer.append(this.page.createElement("span", {
            class: this.menuItemIconClass + " " + icon
        }));
    }

    var textContainer = this.page.createElement("div", {
        class: this.menuItemTextClass
    }).setText(text);

    content.append(iconContainer)
        .append(textContainer);

    return content;
};
