"use strict"

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
