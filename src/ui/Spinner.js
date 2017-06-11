import {noUndefinedGet} from "util";

const LONG_PRESS_DURATION = 600;
const SPINNER_TRANSITION_OUT_DELAY = 300;
const SPINNER_DELAY = LONG_PRESS_DURATION * 0.2 | 0;
const SPINNER_SIZE = 142;

export default function Spinner(opts, deps) {
    opts = noUndefinedGet(opts);
    this.page = deps.page;
    this.$clockwise = this.page.$(opts.clockwise);
    this.$counterclockwise = this.page.$(opts.counterclockwise);
    this.currentSpinner = null;
    this.timerId = -1;
    this.spinnerRemovalId = 0;

}

Spinner.prototype._clear = function() {
    ++this.spinnerRemovalId;
    if (this.currentSpinner) {
        this.currentSpinner.find(`.arc, .arc-container`).forEach((elem) => {
            elem.classList.add(`clear-transition`);
            elem.setAttribute(`style`, ``);
            elem.classList.remove(`clear-transition`);
        });

        this.currentSpinner.removeClass(`visible`);
        this.currentSpinner = null;
    }
};

Spinner.prototype._start = function(x, y) {
    // TODO: touch.{radiusX,radiusY,rotationAngle} can be used
    // To determine which one will be more visible at the start of the animation.
    this.currentSpinner = (x - SPINNER_SIZE / 2) > 0 ? this.$counterclockwise : this.$clockwise;

    this.currentSpinner.removeClass([`initial`, `transition-out`]).
                addClass(`visible`).
                setStyles({
                    left: `${x - SPINNER_SIZE / 2}px`,
                    top: `${y - SPINNER_SIZE / 2}px`
                });

    this.page.changeDom(() => {
        if (this.currentSpinner === this.$clockwise) {
            this.currentSpinner.find(`.arc-1-container, .arc`).
                            forceReflow().
                            setTransform(`rotate(180deg)`);

            this.currentSpinner.find(`.nogap`).
                            forceReflow().
                            setTransform(`rotate(360deg)`);
        } else if (this.currentSpinner === this.$counterclockwise) {
            this.currentSpinner.find(`.arc-2-container, .arc`).
                            forceReflow().
                            setTransform(`rotate(-180deg)`);
            this.currentSpinner.find(`.nogap`).
                            forceReflow().
                            setTransform(`rotate(-360deg)`);
        }
    });



    this.timerId = this.page.setTimeout(() => {
        this.timerId = -1;
        this.stop();
    }, LONG_PRESS_DURATION - SPINNER_DELAY);
};

Spinner.prototype.stop = function() {
    if (this.timerId !== -1) {
        this.page.clearTimeout(this.timerId);
        this.timerId = -1;

        if (this.currentSpinner) {
            const id = ++this.spinnerRemovalId;
            this.currentSpinner.addClass([`initial`, `transition-out`]).
                                forceReflow().
                                removeClass(`initial`);

            this.page.setTimeout(() => {
                if (id === this.spinnerRemovalId) this._clear();
            }, SPINNER_TRANSITION_OUT_DELAY);
        }
    }
};

Spinner.prototype.spinAt = function(x, y) {
   if (this.timerId !== -1) return;
    this._clear();
    this.timerId = this.page.setTimeout(() => {
        this.timerId = -1;
        this._start(x, y);
    }, SPINNER_DELAY);
};
