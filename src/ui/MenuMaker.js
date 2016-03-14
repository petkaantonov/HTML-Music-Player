"use strict";

import { slugTitle } from "lib/util";
import ActionMenu, { ContextMenu } from "ui/ActionMenu";

export default function MenuMaker(recognizerMaker, rippler, globalEvents) {
    this.rippler = rippler;
    this.recognizerMaker = recognizerMaker;
    this.globalEvents = globalEvents;
}

MenuMaker.prototype.createActionMenu = function(dom, opts) {
    opts = Object(opts);
    opts.recognizerMaker = this.recognizerMaker;
    opts.rippler = this.rippler;
    opts.globalEvents = this.globalEvents;
    return new ActionMenu(dom, opts);
};

MenuMaker.prototype.createContextMenu = function(dom, opts) {
    opts = Object(opts);
    opts.recognizerMaker = this.recognizerMaker;
    opts.rippler = this.rippler;
    opts.globalEvents = this.globalEvents;
    return new ContextMenu(dom, opts);
};

MenuMaker.prototype.createMenuItem = function(text, icon) {
    if (icon) {
        icon = '<div class="icon-container"><span class="icon '+ icon + '"></span></div>';
    } else {
        icon = '<div class="icon-container"></div>';
    }
    var className = "action-menu-item-content " + slugTitle(text);
    return '<div class="' + className + '">' + icon + ' <div class="text-container">' + text + '</div></div>';
};
