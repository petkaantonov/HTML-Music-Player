"use strict";

import { slugTitle } from "util";
import Popup from "ui/Popup";
import ApplicationDependencies from "ApplicationDependencies";


export default function PopupContext(opts, deps) {
    opts = Object(opts);

    this.animationContext = deps.animationContext;
    this.page = deps.page;
    this.globalEvents = deps.globalEvents;
    this.db = deps.db;
    this.scrollerContext = deps.scrollerContext;
    this.recognizerContext = deps.recognizerContext;
    this.dbValues = deps.dbValues;
    this.keyboardShortcuts = deps.keyboardShortcuts;
    this.rippler = deps.rippler;

    this.popupZIndex = opts.zIndex;
    this.containerClass = opts.containerClass;
    this.headerClass = opts.headerClass;
    this.footerClass = opts.footerClass;
    this.bodyClass = opts.bodyClass;
    this.scrollAreaContainerClass = opts.scrollAreaContainerClass;
    this.bodyContentClass = opts.bodyContentClass;
    this.closerContainerClass = opts.closerContainerClass;
    this.scrollbarContainerClass = opts.scrollbarContainerClass;
    this.scrollbarRailClass = opts.scrollbarRailClass;
    this.scrollbarKnobClass = opts.scrollbarKnobClass;
    this.popupButtonClass = opts.popupButtonClass;
    this.buttonDisabledClass = opts.buttonDisabledClass;

    this.shownPopups = [];
    this.blocker = this.page.NULL();
    this.animator = null;

    this.popupOpened = this.popupOpened.bind(this);
    this.popupClosed = this.popupClosed.bind(this);
    this.closePopups = this.closePopups.bind(this);

    this.blockerTapRecognizer = this.recognizerContext.createTapRecognizer(this.closePopups);

    deps.ensure();
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
        containerClass: this.containerClass,
        headerClass: this.headerClass,
        footerClass: this.footerClass,
        bodyClass: this.bodyClass,
        scrollAreaContainerClass: this.scrollAreaContainerClass,
        bodyContentClass: this.bodyContentClass,
        closerContainerClass: this.closerContainerClass,
        scrollbarContainerClass: this.scrollbarContainerClass,
        scrollbarRailClass: this.scrollbarRailClass,
        scrollbarKnobClass: this.scrollbarKnobClass,
        popupButtonClass: this.popupButtonClass,
        buttonDisabledClass: this.buttonDisabledClass,
        zIndex: this.popupZIndex,
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
        }
    }, new ApplicationDependencies({
        page: this.page,
        globalEvents: this.globalEvents,
        recognizerContext: this.recognizerContext,
        scrollerContext: this.scrollerContext,
        rippler: this.rippler
    }));

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
