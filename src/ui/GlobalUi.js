"use strict";
import $ from "lib/jquery";
import Promise from "lib/bluebird";
import Popup from "ui/Popup";
import Tooltip from "ui/Tooltip";
import Animator from "ui/Animator";
import keyValueDatabase from "KeyValueDatabase";
import { slugTitle } from "lib/util";
import { setFilter, setTransform } from "lib/DomUtil";

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

export function makePopup(title, body, opener, footerButtons, db) {
    const PREFERENCE_KEY = title + "-popup-preferences";
    const INITIAL_SCALE = 0.1;

    const xPos = function(openerBox, popupBox) {
        return (openerBox.left - popupBox.left) -
                (popupBox.width / 2 * INITIAL_SCALE) +
                (openerBox.width / 2);
    };

    const yPos = function(openerBox, popupBox) {
        return ((openerBox.top + openerBox.height) - popupBox.top) -
                (popupBox.height / 2 * INITIAL_SCALE) +
                (openerBox.height / 2);
    };

    var openerRect = null;
    const getOpenerRect = function(popupNode) {
        var node = $(opener)[0];
        if (!node) return popupNode.getBoundingClientRect();
        return node.getBoundingClientRect();
    };

    var ret = new Popup({
        footerButtons: footerButtons,
        title: title,
        body: body,
        closer: '<span class="icon glyphicon glyphicon-remove"></span>',
        beforeTransitionIn: function($node) {
            setFilter($node, "");
            var animator = new Animator($node[0], {
                interpolate: Animator.DECELERATE_CUBIC,
                properties: [{
                    name: "opacity",
                    start: 0,
                    end: 100,
                    unit: "%",
                    persist: false
                }, {
                    name: "scale",
                    start: [0.95, 0.95],
                    end: [1, 1],
                    persist: false
                }]
            });

            return animator.animate(300);
        },

        beforeTransitionOut: function($node) {
            var animator = new Animator($node[0], {
                interpolate: Animator.DECELERATE_CUBIC,
                properties: [{
                    name: "opacity",
                    start: 100,
                    end: 0,
                    unit: "%",
                    persist: false
                }]
            });

            return animator.animate(300);
        },

        containerClass: "ui-text"
    });

    ret.on("open", function() {
        KeyboardShortcuts.disable();
    });

    ret.on("close", function() {
        KeyboardShortcuts.enable();
        db.set(PREFERENCE_KEY, {
            screenPosition: ret.getScreenPosition(),
            scrollPosition: ret.getScrollPosition()
        });

    });

    db.getInitialValues().then(function(values) {
        if (PREFERENCE_KEY in values) {
            var data = values[PREFERENCE_KEY];
            if (!data) return;
            ret.setScreenPosition(data.screenPosition);
            ret.setScrollPosition(data.scrollPosition);
        }
    });

    $(window).on("clear", ret.close.bind(ret));
    return ret;
};
