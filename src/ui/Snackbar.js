"use strict";
import $ from "lib/jquery";
import Promise from "bluebird";
import EventEmitter from "lib/events";
import { documentHidden, inherits } from "lib/util";
import { changeDom } from "lib/DomUtil";

const NO_TAG = {};

function SnackbarInstance(snackbar, message, opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this.outcome = Snackbar.NO_OUTCOME;
    this.tag = opts.tag || NO_TAG;
    this.visibilityTime = opts.visibilityTime || snackbar.visibilityTime || 5000;

    this._exiting = false;
    this._visible = !documentHidden.value();
    this._snackbar = snackbar;
    this._startedShowing = this._visible ? Date.now() : -1;
    this._initialShowing = Date.now();
    this._isHovering = false;

    this._domNode = this._createDom(message, opts);
    this._visibilityChanged = this._visibilityChanged.bind(this);
    this._clicked = this._clicked.bind(this);
    this._timeoutChecker = this._timeoutChecker.bind(this);
    this._mouseEntered = this._mouseEntered.bind(this);
    this._mouseLeft = this._mouseLeft.bind(this);
    this._resized = this._resized.bind(this);


    this.$().on("click", this._clicked);
    this.$().on("mouseenter", this._mouseEntered);
    this.$().on("mouseleave", this._mouseLeft);
    $(window).on("sizechange", this._resized);
    snackbar.recognizerMaker.createTapRecognizer(this._clicked).recognizeBubbledOn(this.$());
    documentHidden.on("change", this._visibilityChanged);
    this._checkerTimerId = setTimeout(this._timeoutChecker, this.visibilityTime);

    if (this._snackbar.transitionInClass) {
        this.$().addClass(this._snackbar.transitionInClass + " initial");
        this.$().css("willChange", "transform");
        this.$().appendTo("body");
        this._resized();
        this.$().detach();
        this.$().appendTo("body");
        this.$().width();
        this._snackbar.beforeTransitionIn(this.$());
        var self = this;
        changeDom(function() {
            self.$().removeClass("initial");
            setTimeout(function() {
                self.$().css("willChange", "");
            }, 500);
        });
    } else {
        this.$().appendTo("body");
        this._resized();
    }
}
inherits(SnackbarInstance, EventEmitter);

SnackbarInstance.prototype._resized = function() {
    var box = this.$()[0].getBoundingClientRect();
    var maxWidth = $(window).width();
    this.$().css({
        left: Math.max(0, maxWidth - box.width) / 2,
        height: box.height
    });
};

SnackbarInstance.prototype.$ = function() {
    return this._domNode;
};

SnackbarInstance.prototype._clearTimer = function() {
    if (this._checkerTimerId !== -1) {
        this._checkerTimerId = -1;
        clearTimeout(this._checkerTimerId);
    }
};

SnackbarInstance.prototype._createDom = function(message, opts) {
    var action = $(null);
    if (opts.action) {
        action = $("<div>", {
            class: this._snackbar.actionClass + " snackbar-action-" + this._initialShowing
        });

        action.html('<div class="text-container"><div class="text"></div></div>');
        action.find(".text").text(opts.action + "");
    }
    var title = $("<div>", {
        class: this._snackbar.titleClass + " snackbar-title-" + this._initialShowing,
        text: message
    });

    return $("<div>", {
        class: this._snackbar.containerClass
    }).append(title)
      .append(action);
};

SnackbarInstance.prototype.replace = function(message) {
    var self = this;
    this.$().find(".snackbar-title-" + this._initialShowing).text(message + "");
    this._startedShowing = Date.now();
    return new Promise(function(resolve) {
        self.once("hide", function() {
            resolve(self.outcome);
        });
    });
};

SnackbarInstance.prototype._mouseEntered = function() {
    this._clearTimer();
    this._isHovering = true;
};

SnackbarInstance.prototype._mouseLeft = function() {
    this._clearTimer();
    this._startedShowing = Date.now();
    this._isHovering = false;
    this._checkerTimerId = setTimeout(this._timeoutChecker, this.visibilityTime);
};

SnackbarInstance.prototype._timeoutChecker = function() {
    this._checkerTimerId = -1;
    if (this._exiting) return;
    var visibilityTime = this.visibilityTime;
    var shownTime = this._startedShowing === -1 ? 0 : Date.now() - this._startedShowing;

    if (!documentHidden.value() && !this._isHovering) {
        if (shownTime > visibilityTime) {
            this.outcome = Snackbar.TIMED_OUT;
            this._hide();
        } else {
            this._checkerTimerId = setTimeout(this._timeoutChecker, Math.max(0, visibilityTime - shownTime));
        }
    }
};

SnackbarInstance.prototype._visibilityChanged = function() {
    this._clearTimer();
    this._startedShowing = Date.now();
    this._checkerTimerId = setTimeout(this._timeoutChecker, this.visibilityTime);
};

SnackbarInstance.prototype._clicked = function(e) {
    var hasBeenActiveMilliseconds = Date.now() - this._initialShowing;
    var dismissable = hasBeenActiveMilliseconds >
            (this._snackbar.initialUndismissableWindow + this._snackbar.nextDelay);


    var action = this.$().find(".snackbar-action-" + this._initialShowing)[0];
    if ($(e.target).closest(action).length > 0) {
        this.outcome = Snackbar.ACTION_CLICKED;
    } else if (dismissable) {
        this.outcome = Snackbar.DISMISSED;
    }

    if (this.outcome !== Snackbar.NO_OUTCOME) {
        this._hide();
    }
};

SnackbarInstance.prototype._hide = function() {
    if (this._exiting) return;
    this._exiting = true;
    this._removeListeners();
    if (this._snackbar.transitionOutClass) {
        this.$().detach();
        if (this._snackbar.transitionInClass) {
            this.$().removeClass(this._snackbar.transitionInClass + " initial");
        }
        this.$().css("willChange", "transform");
        this.$().addClass(this._snackbar.transitionOutClass + " initial");
        this.$().appendTo("body");
        this.$().height();
        this._snackbar.beforeTransitionOut(this.$());
        var self = this;
        changeDom(function() {
            self.$().removeClass("initial");
        });
    }

    var self = this;
    function doHide() {
        self.emit("hide", self);
        self._destroy();
    }

    if (this.outcome !== Snackbar.ACTION_CLICKED) {
        setTimeout(doHide, this._snackbar.nextDelay);
    } else {
        doHide();
    }
};

SnackbarInstance.prototype._removeListeners = function() {
    this.$().off("click", this._clicked);
    $(window).off("sizechange", this._resized);
    documentHidden.removeListener("change", this._visibilityChanged);
    this._clearTimer();
};

SnackbarInstance.prototype._destroy = function() {
    this._removeListeners();
    this.$().remove();
};

export default function Snackbar(opts) {
    opts = Object(opts);
    this.recognizerMaker = opts.recognizerMaker;
    this.containerClass = opts.containerClass || "snackbar-container";
    this.transitionInClass = opts.transitionInClass || "";
    this.transitionOutClass = opts.transitionOutClass || "";
    this.beforeTransitionIn = opts.beforeTransitionIn || $.noop;
    this.beforeTransitionOut = opts.beforeTransitionOut || $.noop;
    this.actionClass = opts.actionClass || "snackbar-action";
    this.titleClass = opts.titleClass || "snackbar-title";
    this.nextDelay = opts.nextDelay || 300;
    this.visibilityTime = opts.visibilityTime || 5000;
    this.initialUndismissableWindow = opts.initialUndismissableWindow || 500;
    this.maxLength = opts.maxLength || 3;

    this._currentInstance = null;
    this._queue = [];

    this._nextDelayId = -1;
    this._next = this._next.bind(this);
}

Snackbar.prototype._next = function() {
    if (this._nextDelayId !== -1) {
        clearTimeout(this._nextDelayId);
        this._nextDelayId = -1;
    }
    var self = this;
    this._nextDelayId = setTimeout(function() {
        self._currentInstance = null;
        if (self._queue.length) {
            var item = self._queue.shift();
            item.resolve(self.show(item.message, item.opts));
        }
    }, this.nextDelay);
};

Snackbar.prototype.removeByTag = function(tag) {
    var queue = this._queue;
    for (var i = 0; i < queue.length; ++i) {
        if (queue[i].opts.tag === tag) {
            queue.splice(i, 1);
            i--;
        }
    }

    if (this._currentInstance &&
        !this._currentInstance._exiting &&
        this._currentInstance.tag === tag) {
        this._currentInstance.outcome = Snackbar.DISMISSED;
        this._currentInstance._hide();
    }
};

Snackbar.prototype.show = function(message, opts) {
    opts = Object(opts);
    var self = this;

    if (opts.tag && self._currentInstance &&
        opts.tag === self._currentInstance.tag &&
        !self._currentInstance._exiting) {
        self._currentInstance.removeAllListeners("hide");
        return self._currentInstance.replace(message).finally(function() {
            self._next();
        });
    }

    var queue = self._queue;
    var resolve, promise;
    promise = new Promise(function() {
        resolve = arguments[0];
    });

    if (self._currentInstance) {
        if (opts.tag && queue.length) {
            for (var i = 0; i < queue.length; ++i) {
                if (queue[i].opts.tag === opts.tag) {
                    resolve(queue[i].promise);
                    queue[i].message = message;
                    return promise;
                }
            }
        }

        if (queue.length >= this.maxLength) {
            queue.pop();
        }

        queue.push({
            message: message,
            opts: opts,
            resolve: resolve,
            promise: promise
        });
        return promise;
    }
    var instance = new SnackbarInstance(self, message, opts);
    self._currentInstance = instance;
    instance.once("hide", function() {
        resolve(instance.outcome);
        self._next();
    });

    return promise;
};

Snackbar.NO_OUTCOME = -1;
Snackbar.ACTION_CLICKED = 0;
Snackbar.DISMISSED = 1;
Snackbar.TIMED_OUT = 2;
