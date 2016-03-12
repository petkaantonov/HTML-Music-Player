"use strict";
import $ from "lib/jquery";
import Promise from "lib/bluebird";

import { isTextInputNode, offCapture, onCapture, throttle } from "lib/util";
import serviceWorkerManager from "ServiceWorkerManager";
import TrackDisplay from "ui/TrackDisplay";
import Player from "Player";
import Playlist from "Playlist";
import PlaylistModeManager from "ui/PlaylistModeManager";
import Slider from "ui/Slider";


import LocalFiles from "LocalFiles";
import { rippler, spinner } from "ui/GlobalUi";
import { touch as touch } from "features";
import { TOUCH_EVENTS, horizontalTwoFingerSwipeHandler, isTextInputElement, tapHandler, twoFingerTapHandler } from "lib/DomUtil";
import gestureScreenFlasher from "ui/GestureScreenFlasher";
import TrackRating from "TrackRating";
import Track from "Track";

import KeyboardShortcuts from "ui/KeyboardShortcuts";
import { initialize as initializeMainTabs, playlist, search, queue, tabs } from "main_tabs";
import { allowExtensions, allowMimes, directories, requiredFeatures } from "features";
import KeyValueDatabase from "KeyValueDatabase";

if (touch) {
    const enableGestures = function() {
        onCapture(document, TOUCH_EVENTS, toggleGesture);
        onCapture(document, TOUCH_EVENTS, nextTrackGesture);
        onCapture(document, TOUCH_EVENTS, previousTrackGesture);
    };

    const disableGestures = function() {
        offCapture(document, TOUCH_EVENTS, toggleGesture);
        offCapture(document, TOUCH_EVENTS, nextTrackGesture);
        offCapture(document, TOUCH_EVENTS, previousTrackGesture);
    };

    enableGestures();
    KeyboardShortcuts.on("disable", disableGestures);
    KeyboardShortcuts.on("enable", enableGestures);

    onCapture(document, TOUCH_EVENTS, tapHandler(function(e) {
        rippler.rippleAt(e.clientX, e.clientY, 35, "#aaaaaa");
    }));
}

const rinput = /^(input|select|textarea|button)$/i;
onCapture(document, "keydown", function(e) {
    var key = e.key;
    if (key === "Escape") {
        $(window).trigger("clear");
    }

    if (e.target === document.activeElement &&
        e.target.tabIndex >= 0 &&
        !rinput.test(e.target.nodeName)) {


        if (key === "Spacebar" || key === "Enter") {
            var box = e.target.getBoundingClientRect();
            var x = (((box.left + box.right) / 2) | 0) - window.scrollX;
            var y = (((box.top + box.bottom) / 2) | 0) - window.scrollY;
            var ev = new MouseEvent("click", {
                view: window,
                bubbles: true,
                cancelable: true,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                metaKey: e.metaKey,
                button: -1,
                buttons: 0,
                screenX: x,
                clientX: x,
                screenY: y,
                clientY: y
            });
            e.target.dispatchEvent(ev);
        } else if (key === "Escape") {
            e.target.blur();
        }
    }

});

(function() {
    // Android keyboard fix.
    var fireSizeChangeEvents = true;
    var pendingSizeChange = false;

    const triggerSizeChange = function() {
        if (!fireSizeChangeEvents) {
            return;
        }

        var activeElement = document.activeElement;
        if (activeElement && isTextInputElement(activeElement)) {
            pendingSizeChange = true;
            return;
        }

        var event = new Event("sizechange", {
            bubbles: true,
            cancelable: false
        });
        window.dispatchEvent(event);
    };

    const resetFireSizeChangeEvents = throttle(function() {
        fireSizeChangeEvents = true;
    }, 500);

    const firePendingSizeChangeEvent = throttle(triggerSizeChange, 100);


    onCapture(document, "focus", function(e) {
        if (isTextInputElement(e.target)) {
            fireSizeChangeEvents = false;
            resetFireSizeChangeEvents();
        }
    });

    onCapture(document, "blur", function(e) {
        if (isTextInputElement(e.target)) {
            window.scrollTo(0, 0);
            if (pendingSizeChange) {
                pendingSizeChange = false;
                firePendingSizeChangeEvent();
            }
        }
    });

    requestAnimationFrame(triggerSizeChange);
    onCapture(window, "resize", triggerSizeChange);
})();
}).catch(function(e) {
    console.log(e && (e.stack || e.message));
});
