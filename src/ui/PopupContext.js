"use strict";

import { slugTitle } from "util";
import Popup from "ui/Popup";

export default function PopupContext(opts) {
    opts = Object(opts);
    this.animationContext = opts.animationContext;
    this.page = opts.page;
    this.globalEvents = opts.globalEvents;
    this.db = opts.db;
    this.scrollerContext = opts.scrollerContext;
    this.recognizerContext = opts.recognizerContext;
    this.dbValues = opts.dbValues;
    this.keyboardShortcuts = opts.keyboardShortcuts;
    this.rippler = opts.rippler;
    this.popupZIndex = opts.zIndex;

    this.shownPopups = [];
    this.blocker = this.page.NULL();
    this.animator = null;

    this.popupOpened = this.popupOpened.bind(this);
    this.popupClosed = this.popupClosed.bind(this);
    this.closePopups = this.closePopups.bind(this);

    this.blockerTapRecognizer = this.recognizerContext.createTapRecognizer(this.closePopups);
}

PopupContext.prototype.closePopups = function() {
    this.shownPopups.forEach(function(v) {
        v.close();
    });
};

PopupContext.prototype.showBlocker = function() {
    if (this.animator) {
        this.animator.stop(true);
        this.animator = null;
        this.blocker.remove();
    }

    this.blocker = this.page.createElement("div", {class: "popup-blocker"}).appendTo("body");
    this.blocker.addEventListener("click", this.closePopups);
    this.blockerTapRecognizer.recognizeBubbledOn(this.blocker);

    var animator = this.animationContext.createAnimator(this.blocker, {
        opacity: {
            range: [0, 55],
            unit: "%",
            duration: 300,
            interpolate: this.animationContext.DECELERATE_CUBIC
        }
    });

    animator.start();
};

PopupContext.prototype.hideBlocker = function() {
    if (!this.blocker.length) return;

    var animator = this.animationContext.createAnimator(this.blocker, {
        opacity: {
            range: [55, 0],
            unit: "%",
            duration: 300,
            interpolate: this.animationContext.DECELERATE_CUBIC
        }
    });

    this.animator = animator;

    animator.start().then(function(wasCancelled) {
        if (!wasCancelled) {
            this.blockerTapRecognizer.unrecognizeBubbledOn(this.blocker);
            this.blocker.remove();
            this.blocker = this.page.NULL();
            this.animator = null;
        }
    }.bind(this));
};

PopupContext.prototype.popupOpened = function(popup) {
    this.keyboardShortcuts.disable();

    if (this.shownPopups.push(popup) === 1) {
        this.showBlocker();
    }
};

PopupContext.prototype.popupClosed = function(popup) {
    this.keyboardShortcuts.enable();
    this.db.set(this.toPreferenceKey(popup.title), {
        screenPosition: popup.getScreenPosition(),
        scrollPosition: popup.getScrollPosition()
    });

    var index = this.shownPopups.indexOf(popup);
    if (index >= 0) {
        this.shownPopups.splice(index, 1);
        if (this.shownPopups.length === 0) {
            this.hideBlocker();
        }
    }
};

PopupContext.prototype.toPreferenceKey = function(popupTitle) {
    return slugTitle(popupTitle) + "-popup-preferences";
};

PopupContext.prototype.makePopup = function(title, body, opener, footerButtons) {
    var self = this;
    var popup = new Popup({
        page: this.page,
        zIndex: this.popupZIndex,
        globalEvents: this.globalEvents,
        recognizerContext: this.recognizerContext,
        scrollerContext: this.scrollerContext,
        rippler: this.rippler,
        footerButtons: footerButtons,
        title: title,
        body: body,
        closer: '<span class="icon glyphicon glyphicon-remove"></span>',
        beforeTransitionIn: function($node) {
            return self.animationContext.createAnimator($node, {
                opacity: {
                    interpolate: self.animationContext.DECELERATE_CUBIC,
                    duration: 300,
                    range: [0, 100],
                    unit: "%"
                },
                scale: {
                    interpolate: self.animationContext.DECELERATE_CUBIC,
                    duration: 300,
                    range: [
                        [0.95, 0.95],
                        [1, 1]
                    ],
                    baseValue: $node.getTransform()
                }
            }).start();
        },

        beforeTransitionOut: function($node) {
            return self.animationContext.createAnimator($node, {
                opacity: {
                    interpolate: self.animationContext.DECELERATE_CUBIC,
                    duration: 300,
                    range: [100, 0],
                    unit: "%"
                }
            }).start();
        },

        containerClass: "ui-text"
    });

    popup.on("open", this.popupOpened);
    popup.on("close", this.popupClosed);

    if (this.toPreferenceKey(popup.title) in self.dbValues) {
        var data = Object(self.dbValues[this.toPreferenceKey(popup.title)]);
        popup.setScreenPosition(data.screenPosition);
        popup.setScrollPosition(data.scrollPosition);
    }

    this.globalEvents.on("clear", popup.close.bind(popup));

    return popup;
};
