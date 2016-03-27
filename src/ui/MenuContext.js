"use strict";

import { slugTitle } from "util";
import ActionMenu, { ContextMenu } from "ui/ActionMenu";
import ApplicationDependencies from "ApplicationDependencies";

export default function MenuContext(deps) {
    this.page = deps.page;
    this.rippler = deps.rippler;
    this.recognizerContext = deps.recognizerContext;
    this.globalEvents = deps.globalEvents;
    deps.ensure();
}

MenuContext.prototype.createActionMenu = function(opts) {
    return new ActionMenu(opts, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler,
        globalEvents: this.globalEvents
    }));
};

MenuContext.prototype.createContextMenu = function(opts) {
    return new ContextMenu(opts, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler,
        globalEvents: this.globalEvents
    }));
};

MenuContext.prototype.createMenuItem = function(text, icon) {
    if (icon) {
        icon = '<div class="icon-container"><span class="icon '+ icon + '"></span></div>';
    } else {
        icon = '<div class="icon-container"></div>';
    }
    var className = "action-menu-item-content " + slugTitle(text);
    return '<div class="' + className + '">' + icon + ' <div class="text-container">' + text + '</div></div>';
};
