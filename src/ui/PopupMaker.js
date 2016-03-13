"use strict";

import $ from "lib/jquery";
import Promise from "lib/bluebird";
import { slugTitle } from "lib/util";
import { setFilter, setTransform, changeDom } from "lib/DomUtil";
import Animator from "ui/Animator";

const NULL = $(null);

export default function PopupMaker(opts) {
    opts = Object(opts);
    this.db = opts.db;
    this.scrollerMaker = opts.scrollerMaker;
    this.recognizerMaker = opts.recognizerMaker;
    this.dbValues = opts.dbValues;
    this.keyboardShortcuts = opts.keyboardShortcuts;
    this.rippler = opts.rippler;

    this.shownPopups = [];
    this.blocker = NULL;
    this.anim = null;

    this.popupOpened = this.popupOpened.bind(this);
    this.popupClosed = this.popupClosed.bind(this);
    this.closePopups = this.closePopups.bind(this);

    this.blockerTapRecognizer = this.recognizerMaker.createTapRecognizer(this.closePopups);
}

PopupMaker.prototype.closePopups = function() {
    this.shownPopups.forEach(function(v) {
        v.close();
    });
};

PopupMaker.prototype.showBlocker = function() {
    if (this.anim) {
        this.anim.cancel();
        this.anim = null;
        this.blocker.remove();
    }

    this.blocker = $("<div>", {class: "popup-blocker"}).appendTo("body");
    this.blocker.on("click", this.closePopups);

    this.blockerTapRecognizer.recognizeBubbledOn(this.blocker);

    var animator = new Animator(this.blocker[0], {
        properties: [{
            name: "opacity",
            start: 0,
            end: 55,
            unit: "%",
            duration: 300
        }],
        interpolate: Animator.DECELERATE_CUBIC
    });
    animator.animate();
};

PopupMaker.prototype.hideBlocker = function() {
    if (!this.blocker.length) return;
    var animator = new Animator(this.blocker[0], {
        properties: [{
            name: "opacity",
            start: 55,
            end: 0,
            unit: "%",
            duration: 300
        }],
        interpolate: Animator.DECELERATE_CUBIC
    });

    this.anim = animator.animate().bind(this).then(function() {
        this.blockerTapRecognizer.unrecognizeBubbledOn(this.blocker);
        this.blocker.remove();
        this.blocker = NULL;
        this.anim = null;
    });
};

PopupMaker.prototype.popupOpened = function(popup) {
    this.keyboardShortcuts.disable();

    if (this.shownPopups.push(popup) === 1) {
        this.showBlocker();
    }
};

PopupMaker.prototype.popupClosed = function(popup) {
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

PopupMaker.prototype.toPreferenceKey = function(popupTitle) {
    return slugTitle(popupTitle) + "-popup-preferences";
};

PopupMaker.prototype.makePopup = function(title, body, opener, footerButtons) {
    var self = this;
    var popup = new Popup({
        recognizerMaker: this.recognizerMaker,
        scrollerMaker: this.scrollerMaker,
        rippler: this.rippler,
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

    popup.on("open", this.popupOpened);
    popup.on("close", this.popupClosed);

    if (this.toPreferenceKey(popup.title) in self.dbValues) {
        var data = Object(self.dbValues[this.toPreferenceKey(popup.title)]);
        popup.setScreenPosition(data.screenPosition);
        popup.setScrollPosition(data.scrollPosition);
    }

    $(window).on("clear", popup.close.bind(popup));

    return popup;
};
