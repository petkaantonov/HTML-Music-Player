"use strict";

const LONG_PRESS_DURATION = 600;
const SPINNER_TRANSITION_OUT_DELAY = 300;
const SPINNER_DELAY = LONG_PRESS_DURATION * 0.2 | 0;
const SPINNER_SIZE = 142;

export default function Spinner(opts, deps) {
    opts = Object(opts);
    this.page = deps.page;
    this.$clockwise = this.page.$(opts.clockwise);
    this.$counterclockwise = this.page.$(opts.counterclockwise);
    this.currentSpinner = null;
    this.timerId = -1;
    this.spinnerRemovalId = 0;
    deps.ensure();
}

Spinner.prototype._clear = function() {
    ++this.spinnerRemovalId;
    if (this.currentSpinner) {
        this.currentSpinner.find(".arc, .arc-container").forEach(function(elem) {
            elem.classList.add("clear-transition");
            elem.setAttribute("style", "");
            elem.classList.remove("clear-transition");
        });

        this.currentSpinner.removeClass("visible");
        this.currentSpinner = null;
    }
};

Spinner.prototype._start = function(x, y) {
    // TODO: touch.{radiusX,radiusY,rotationAngle} can be used
    // to determine which one will be more visible at the start of the animation.
    this.currentSpinner = (x - SPINNER_SIZE / 2) > 0 ? this.$counterclockwise : this.$clockwise;

    this.currentSpinner.removeClass(["initial", "transition-out"])
                .addClass("visible")
                .setStyles({
                    left: (x - SPINNER_SIZE / 2) + "px",
                    top: (y - SPINNER_SIZE / 2) + "px"
                });

    var self = this;
    this.page.changeDom(function() {
        if (self.currentSpinner === self.$clockwise) {
            self.currentSpinner.find(".arc-1-container, .arc")
                            .forceReflow()
                            .setTransform("rotate(180deg)");

            self.currentSpinner.find(".nogap")
                            .forceReflow()
                            .setTransform("rotate(360deg)");
        } else if (self.currentSpinner === self.$counterclockwise) {
            self.currentSpinner.find(".arc-2-container, .arc")
                            .forceReflow()
                            .setTransform("rotate(-180deg)");
            self.currentSpinner.find(".nogap")
                            .forceReflow()
                            .setTransform("rotate(-360deg)");
        }
    });



    this.timerId = this.page.setTimeout(function() {
        self.timerId = -1;
        self.stop();
    }, LONG_PRESS_DURATION - SPINNER_DELAY);
};

Spinner.prototype.stop = function() {
    if (this.timerId !== -1) {
        this.page.clearTimeout(this.timerId);
        this.timerId = -1;

        if (this.currentSpinner) {
            var id = ++this.spinnerRemovalId;
            this.currentSpinner.addClass(["initial", "transition-out"])
                                .forceReflow()
                                .removeClass("initial");

            var self = this;
            this.page.setTimeout(function() {
                if (id === self.spinnerRemovalId) self._clear();
            }, SPINNER_TRANSITION_OUT_DELAY);
        }
    }
};

Spinner.prototype.spinAt = function(x, y) {
   if (this.timerId !== -1) return;
    this._clear();
    var self = this;
    this.timerId = this.page.setTimeout(function() {
        self.timerId = -1;
        self._start(x, y);
    }, SPINNER_DELAY);
};
