"use strict";
import $ from "lib/jquery";
import Tooltip from "ui/Tooltip";
import { slugTitle } from "lib/util";


export function contextMenuItem(text, icon) {
    if (icon) {
        icon = '<div class="icon-container"><span class="icon '+ icon + '"></span></div>';
    } else {
        icon = '<div class="icon-container"></div>';
    }
    var className = "action-menu-item-content " + slugTitle(text);
    return '<div class="' + className + '">' + icon + ' <div class="text-container">' + text + '</div></div>';
};

export function makeTooltip(target, content) {
    return new Tooltip({
        activation: "hover",
        transitionClass: "fade-in",
        ScreenDirection: "up",
        ScreenAlign: "begin",
        container: $("body"),
        arrow: false,
        target: target,
        delay: 600,
        classPrefix: "app-tooltip autosized-tooltip minimal-size-tooltip",
        content: content
    });
};
