"use strict";

import $ from "lib/jquery";
import Promise from "lib/bluebird";
import { slugTitle } from "lib/util";
import { setFilter, setTransform } from "lib/DomUtil";
import Animator from "ui/Animator";

export default function PopupMaker(opts) {
    opts = Object(opts);
    this.db = opts.db;
    this.env = opts.env;
    this.dbValues = opts.dbValues;
    this.keyboardShortcuts = opts.keyboardShortcuts;
}

PopupMaker.prototype.makePopup = function(title, body, opener, footerButtons) {
    var self = this;
    const PREFERENCE_KEY = slugTitle(title) + "-popup-preferences";
    const INITIAL_SCALE = 0.1;

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
        self.keyboardShortcuts.disable();
    });

    ret.on("close", function() {
        self.keyboardShortcuts.enable();

        self.db.set(PREFERENCE_KEY, {
            screenPosition: ret.getScreenPosition(),
            scrollPosition: ret.getScrollPosition()
        });
    });

    if (PREFERENCE_KEY in self.dbValues) {
        var data = Object(self.dbValues[PREFERENCE_KEY]);
        ret.setScreenPosition(data.screenPosition);
        ret.setScrollPosition(data.scrollPosition);
    }

    $(window).on("clear", ret.close.bind(ret));

    return ret;
};
