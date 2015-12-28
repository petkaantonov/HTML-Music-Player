"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird.js");

const Snackbar = require("./Snackbar");
const Popup = require("./Popup");
const Tooltip = require("./Tooltip");
const Animator = require("./Animator");
const keyValueDatabase = require("./KeyValueDatabase");

const GlobalUi = module.exports;

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

    var ret = new Popup({
        title: title,
        body: body,
        closer: '<span class="icon glyphicon glyphicon-remove"></span>',
        beforeTransitionIn: function($node) {
            var openerBox = $(opener)[0].getBoundingClientRect();
            var popupBox = $node[0].getBoundingClientRect();

            var animator = new Animator($node[0], {
                interpolate: Animator.EASE_IN,
                properties: [{
                    name: "scale",
                    start: [0.1, 0.1],
                    end: [1, 1]
                }]
            });

            var x1 = openerBox.left + openerBox.width / 2;
            var y1 = openerBox.top + openerBox.height / 2;
            var x2 = popupBox.left;
            var y2 = popupBox.top;

            var path = animator.createPath();
            path.moveTo(x1, y1);
            path.fastOutLinearInCurveTo(x2, y2);
            path.close();
            animator.animate(400, path);
        },

        beforeTransitionOut: function($node) {
            return new Promise(function(resolve) {
                var animator = new Animator($node[0], {
                    interpolate: Animator.EASE_IN,
                    properties: [{
                        name: "scale",
                        start: [1, 1],
                        end: [0, 0]
                    }]
                });
                animator.on("animationEnd", resolve);

                var openerBox = $(opener)[0].getBoundingClientRect();
                var popupBox = $node[0].getBoundingClientRect();

                var x1 = popupBox.left;
                var y1 = popupBox.top;
                var x2 = openerBox.left + openerBox.width / 2;
                var y2 = openerBox.top + openerBox.height / 2;

                var path = animator.createPath();
                path.moveTo(x1, y1);
                path.fastOutLinearInCurveTo(x2, y2);
                path.close();
                animator.animate(400, path);
            });
        },

        containerClass: "ui-text"
    });

    const hotkeyManager = require("./HotkeyManager");
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
