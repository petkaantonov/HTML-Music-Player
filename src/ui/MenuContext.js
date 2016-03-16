"use strict";

import { slugTitle } from "util";
import ActionMenu, { ContextMenu } from "ui/ActionMenu";

export default function MenuContext(recognizerContext, rippler, globalEvents) {
    this.rippler = rippler;
    this.recognizerContext = recognizerContext;
    this.globalEvents = globalEvents;
}

MenuContext.prototype.createActionMenu = function(dom, opts) {
    opts = Object(opts);
    opts.recognizerContext = this.recognizerContext;
    opts.rippler = this.rippler;
    opts.globalEvents = this.globalEvents;
    return new ActionMenu(dom, opts);
};

MenuContext.prototype.createContextMenu = function(dom, opts) {
    opts = Object(opts);
    opts.recognizerContext = this.recognizerContext;
    opts.rippler = this.rippler;
    opts.globalEvents = this.globalEvents;
    return new ContextMenu(dom, opts);
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
