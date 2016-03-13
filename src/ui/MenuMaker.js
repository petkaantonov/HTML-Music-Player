"use strict"

import { slugTitle } from "lib/util";
import ActionMenu, { ContextMenu } from "ui/ActionMenu";

export default function MenuMaker(recognizerMaker, rippler) {
    this.rippler = rippler;
    this.recognizerMaker = recognizerMaker;
}

MenuMaker.prototype.createActionMenu = function(dom, opts) {
    opts = Object(opts);
    opts.recognizerMaker = this.recognizerMaker;
    opts.rippler = this.rippler;
    return new ActionMenu(dom, opts);
};

MenuMaker.prototype.createContextMenu = function(dom, opts) {
    opts = Object(opts);
    opts.recognizerMaker = this.recognizerMaker;
    opts.rippler = this.rippler;
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
