"use strict";
import $ from "lib/jquery";
import Promise from "lib/bluebird";

import Snackbar from "ui/Snackbar";
import Popup from "ui/Popup";
import Tooltip from "ui/Tooltip";
import Animator from "ui/Animator";
import keyValueDatabase from "KeyValueDatabase";
import { slugTitle } from "lib/util";
import Rippler from "ui/Rippler";
import { setFilter, setTransform } from "lib/DomUtil";
import KeyboardShortcuts from "ui/KeyboardShortcuts";

const GlobalUi = module.exports;

contextMenuItem = function(text, icon) {
    if (icon) {
        icon = '<div class="icon-container"><span class="icon '+ icon + '"></span></div>';
    } else {
        icon = '<div class="icon-container"></div>';
    }
    var className = "action-menu-item-content " + slugTitle(text);
    return '<div class="' + className + '">' + icon + ' <div class="text-container">' + text + '</div></div>';
};

snackbar = new Snackbar({
    transitionInClass: "transition-in",
    transitionOutClass: "transition-out",
    nextDelay: 400,
    visibilityTime: 4400
});

makeTooltip = function(target, content) {
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

makePopup = function(title, body, opener, footerButtons) {
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
        keyValueDatabase.set(PREFERENCE_KEY, {
            screenPosition: ret.getScreenPosition(),
            scrollPosition: ret.getScrollPosition()
        });

    });

    keyValueDatabase.getInitialValues().then(function(values) {
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

rippler = new Rippler();

spinner = (function() {
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
                setTransform(this, "");
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
                setTransform(currentSpinner.find(".arc-1-container, .arc").reflow(), "rotate(180deg)");
                setTransform(currentSpinner.find(".nogap").reflow(), "rotate(360deg)");
            } else if (currentSpinner === $counterclockwise) {
                setTransform(currentSpinner.find(".arc-2-container, .arc").reflow(), "rotate(-180deg)");
                setTransform(currentSpinner.find(".nogap").reflow(), "rotate(-360deg)");
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

gestureEducation = function(gesture) {
    var msg = gestureEducationMessages[gesture];
    var tag = gesture + "-gesture-education";
    if (!msg) return;

    gestureEducationPreferences.then(function(values) {
        if (values[gesture] === true) return;
        return snackbar.show(msg, {
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
