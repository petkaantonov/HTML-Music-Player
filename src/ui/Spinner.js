"use strict";

import { reflow } from "lib/DomUtil";

const LONG_PRESS_DURATION = 600;
const SPINNER_TRANSITION_OUT_DELAY = 300;
const SPINNER_DELAY = LONG_PRESS_DURATION * 0.2 | 0;
const SPINNER_SIZE = 142;

export default function Spinner(opts) {
    opts = Object(opts);
    this.$clockwise = $(opts.clockwise);
    this.$counterclockwise = $(opts.counterclockwise);
    this.currentSpinner = null;
    this.timerId = -1;
    this.spinnerRemovalId = 0;
}

Spinner.prototype._clear = function() {
    ++this.spinnerRemovalId;
    if (this.currentSpinner) {
        this.currentSpinner.find(".arc, .arc-container").each(function() {
            $(this).addClass("_clear-transition");
            setTransform(this, "");
            $(this).removeClass("_clear-transition");
        });

        this.currentSpinner.removeClass("visible");
        this.currentSpinner = null;
    }
};

Spinner.prototype._start = function(x, y) {
    // TODO: touch.{radiusX,radiusY,rotationAngle} can be used
    // to determine which one will be more visible at the start of the animation.
    this.currentSpinner = (x - SPINNER_SIZE / 2) > 0 ? this.$counterclockwise : this.$clockwise;

    this.currentSpinner.removeClass("initial transition-out").addClass("visible").css({
        left: x - SPINNER_SIZE / 2,
        top: y - SPINNER_SIZE / 2
    });

    var self = this;
    requestAnimationFrame(function() {
        if (self.currentSpinner === self.$clockwise) {
            setTransform(reflow(self.currentSpinner.find(".arc-1-container, .arc")), "rotate(180deg)");
            setTransform(reflow(self.currentSpinner.find(".nogap")), "rotate(360deg)");
        } else if (self.currentSpinner === self.$counterclockwise) {
            setTransform(reflow(self.currentSpinner.find(".arc-2-container, .arc")), "rotate(-180deg)");
            setTransform(reflow(self.currentSpinner.find(".nogap")), "rotate(-360deg)");
        }
    });

    this.timerId = setTimeout(function() {
        self.timerId = -1;
        self.stop();
    }, LONG_PRESS_DURATION - SPINNER_DELAY);
};

Spinner.prototype.stop = function() {
    if (this.timerId !== -1) {
        clearTimeout(this.timerId);
        this.timerId = -1;

        if (this.currentSpinner) {
            var id = ++this.spinnerRemovalId;
            this.currentSpinner.addClass("initial transition-out");
            this.currentSpinner.reflow();
            this.currentSpinner.removeClass("initial");
            var self = this;
            setTimeout(function() {
                if (id === self.spinnerRemovalId) self._clear();
            }, SPINNER_TRANSITION_OUT_DELAY);
        }
    }
};

Spinner.prototype.spinAt = function(x, y) {
   if (this.timerId !== -1) return;
    this._clear();
    var self = this;
    this.timerId = setTimeout(function() {
        self.timerId = -1;
        self._start(x, y);
    }, SPINNER_DELAY);
};
