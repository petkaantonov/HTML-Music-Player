"use strict";

import { onCapture, throttle } from "lib/util";
import { isTextInputElement } from "lib/DomUtil";

export default function AndroidKeyboardFixer() {
    this.fireSizeChangeEvents = true;
    this.pendingSizeChange = false;

    this.triggerSizeChange = this.triggerSizeChange.bind(this);
    this.firePendingSizeChangeEvent = this.firePendingSizeChangeEvent.bind(this);
    this.resetFireSizeChangeEvents = this.resetFireSizeChangeEvents.bind(this);
    this.elementFocused = this.elementFocused.bind(this);
    this.elementBlurred = this.elementBlurred.bind(this);

    onCapture(document, "focus", this.elementFocused);
    onCapture(document, "blur", this.elementBlurred);
    onCapture(window, "resize", this.triggerSizeChange);
}

AndroidKeyboardFixer.prototype.triggerSizeChange = function() {
    if (!this.fireSizeChangeEvents) {
        return;
    }

    var activeElement = document.activeElement;
    if (activeElement && isTextInputElement(activeElement)) {
        this.pendingSizeChange = true;
        return;
    }

    window.dispatchEvent(new Event("sizechange", {
        bubbles: true,
        cancelable: false
    }));
};

AndroidKeyboardFixer.prototype.firePendingSizeChangeEvent =
    throttle(AndroidKeyboardFixer.prototype.triggerSizeChange, 100);

AndroidKeyboardFixer.prototype.resetFireSizeChangeEvents = throttle(function() {
    this.fireSizeChangeEvents = true;
}, 500);

AndroidKeyboardFixer.prototype.elementFocused = function(e) {
    if (isTextInputElement(e.target)) {
        this.fireSizeChangeEvents = false;
        this.resetFireSizeChangeEvents();
    }
};

AndroidKeyboardFixer.prototype.elementBlurred = function(e) {
    if (isTextInputElement(e.target)) {
        window.scrollTo(0, 0);
        if (this.pendingSizeChange) {
            this.pendingSizeChange = false;
            this.firePendingSizeChangeEvent();
        }
    }
};
