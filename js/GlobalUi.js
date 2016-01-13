"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird.js");

const Snackbar = require("./Snackbar");
const Popup = require("./Popup");
const Tooltip = require("./Tooltip");
const Animator = require("./Animator");
const keyValueDatabase = require("./KeyValueDatabase");
const features = require("./features");
const util = require("./util");

const GlobalUi = module.exports;

GlobalUi.contextMenuItem = function(text, icon, iconText) {
    if (!iconText) iconText = "";

    if (icon) {
        icon = '<div class="icon-container"><span class="icon '+ icon + '">' + iconText + '</span></div>';
    } else {
        icon = '<div class="icon-container"></div>';
    }
    var className = "action-menu-item-content " + util.slugTitle(text);
    return '<div class="' + className + '">' + icon + ' <div class="text-container">' + text + '</div></div>';
};

GlobalUi.snackbar = new Snackbar({
    transitionInClass: "transition-in",
    transitionOutClass: "transition-out",
    beforeTransitionIn: function($root) {
        $root.find(".snackbar-title, .snackbar-action").css("opacity", 0).animate({opacity: 1}, 400, "easeIn");
    },
    beforeTransitionOut: function($root) {
        $root.find(".snackbar-title, .snackbar-action").css("opacity", 1).animate({opacity: 0}, 400, "easeOut");
    },
    nextDelay: 400,
    visibilityTime: 4400
});

GlobalUi.makeTooltip = function(target, content) {
    return new Tooltip({
        activation: "hover",
        transitionClass: "fade-in",
        preferredDirection: "up",
        preferredAlign: "begin",
        container: $("body"),
        arrow: false,
        target: target,
        delay: 600,
        classPrefix: "app-tooltip autosized-tooltip minimal-size-tooltip",
        content: content
    });
};

GlobalUi.makePopup = function(title, body, opener) {
    const PREFERENCE_KEY = title + "position";
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
        title: title,
        body: body,
        closer: '<span class="icon glyphicon glyphicon-remove"></span>',
        beforeTransitionIn: function($node) {
            var animator = new Animator($node[0], {
                interpolate: Animator.DECELERATE_CUBIC,
                properties: [{
                    name: "opacity",
                    start: 0,
                    end: 100,
                    unit: "%"
                }, {
                    name: "scale",
                    start: [0.95, 0.95],
                    end: [1, 1]
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
                    unit: "%"
                }]
            });

            return animator.animate(300);
        },

        containerClass: "ui-text"
    });

    ret.on("open", function() {
        hotkeyManager.disableHotkeys();
    });

    ret.on("close", function() {
        hotkeyManager.enableHotkeys();
        keyValueDatabase.set(title + "position", ret.getPreferredPosition());

    });

    keyValueDatabase.getInitialValues().then(function(values) {
        if (PREFERENCE_KEY in values) ret.setPreferredPosition(values[PREFERENCE_KEY]);
    });

    $(window).on("clear", ret.close.bind(ret));
    return ret;
};

var hotkeyManager;
GlobalUi.setHotkeyManager = function(value) {
    hotkeyManager = value;
};
