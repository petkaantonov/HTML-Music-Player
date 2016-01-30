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
const Rippler = require("./Rippler");
const domUtil = require("./DomUtil");

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

GlobalUi.rippler = new Rippler();

GlobalUi.spinner = (function() {
    const LONG_PRESS_DURATION = 600;
    const SPINNER_TRANSITION_OUT_DELAY = 300;
    const SPINNER_DELAY = LONG_PRESS_DURATION * 0.2 | 0;
    const SPINNER_SIZE = 142;

    var $clockwise = $("#clockwise-spinner");
    var $counterclockwise = $("#counterclockwise-spinner");

    var currentSpinner = null;
    var timerId = -1;
    var spinnerRemovalId = 0;

    function clear() {
        ++spinnerRemovalId;
        if (currentSpinner) {
            currentSpinner.find(".arc, .arc-container").each(function() {
                $(this).addClass("clear-transition");
                domUtil.setTransform(this, "");
                $(this).removeClass("clear-transition");
            });

            currentSpinner.removeClass("visible");
            currentSpinner = null;
        }
    }

    function stop() {
        if (timerId !== -1) {
            clearTimeout(timerId);
            timerId = -1;

            if (currentSpinner) {
                var id = ++spinnerRemovalId;
                currentSpinner.addClass("initial transition-out");
                currentSpinner.reflow();
                currentSpinner.removeClass("initial");
                setTimeout(function() {
                    if (id === spinnerRemovalId) clear();
                }, SPINNER_TRANSITION_OUT_DELAY);
            }
        }
    }

    function initSpinner(x, y) {
        // TODO: touch.{radiusX,radiusY,rotationAngle} can be used
        // to determine which one will be more visible at the start of the animation.
        currentSpinner = (x - SPINNER_SIZE / 2) > 0 ? $counterclockwise : $clockwise;

        currentSpinner.removeClass("initial transition-out").addClass("visible").css({
            left: x - SPINNER_SIZE / 2,
            top: y - SPINNER_SIZE / 2
        });

        requestAnimationFrame(function() {
            if (currentSpinner === $clockwise) {
                domUtil.setTransform(currentSpinner.find(".arc-1-container, .arc").reflow(), "rotate(180deg)");
                domUtil.setTransform(currentSpinner.find(".nogap").reflow(), "rotate(360deg)");
            } else if (currentSpinner === $counterclockwise) {
                domUtil.setTransform(currentSpinner.find(".arc-2-container, .arc").reflow(), "rotate(-180deg)");
                domUtil.setTransform(currentSpinner.find(".nogap").reflow(), "rotate(-360deg)");
            }
        });

        timerId = setTimeout(function() {
            timerId = -1;
            stop();
        }, LONG_PRESS_DURATION - SPINNER_DELAY);
    }

    return {
        spinAt: function(x, y) {
            if (timerId !== -1) return;
            clear();
            timerId = setTimeout(function() {
                timerId = -1;
                initSpinner(x, y);
            }, SPINNER_DELAY);
        },
        stop: stop
    };
})();


const gestureEducationMessages = {
    "playpause": "Tap the screen with two fingers to toggle play/pause",
    "next": "Swipe right with two fingers to play the next track",
    "previous": "Swip left with two fingers to play the previous track"
};
const GESTURE_EDUCATION_KEY = "gesture-education";
const gestureEducationPreferences = keyValueDatabase.getInitialValues().get(GESTURE_EDUCATION_KEY).then(Object);

GlobalUi.gestureEducation = function(gesture) {
    var msg = gestureEducationMessages[gesture];
    var tag = gesture + "-gesture-education";
    if (!msg) return;

    gestureEducationPreferences.then(function(values) {
        if (values[gesture] === true) return;
        return GlobalUi.snackbar.show(msg, {
            action: "got it",
            visibilityTime: 6500,
            tag: tag
        }).then(function(outcome) {
            if (outcome === Snackbar.ACTION_CLICKED ||
                outcome === Snackbar.DISMISSED) {
                values[gesture] = true;
                return keyValueDatabase.set(GESTURE_EDUCATION_KEY, values);
            }
        });
    });
};
