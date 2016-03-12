"use strict";

import Animator from "ui/Animator";
import $ from "lib/jquery";
import Promise from "lib/bluebird";

const gestureIcon = function(icon) {
    return '<div class="gesture-flash"><span class="gesture-flash-icon ' + icon
                +'"></span></div>';
};

const gestureNameMap = {
    play: gestureIcon("glyphicon glyphicon-play"),
    pause: gestureIcon("glyphicon glyphicon-pause"),
    next: gestureIcon("glyphicon glyphicon-step-forward"),
    previous: gestureIcon("glyphicon glyphicon-step-backward")
};

export default function GestureScreenFlasher() {
    this._queue = [];
    this._current = null;
}

GestureScreenFlasher.prototype._next = function() {
    this._current = null;
    if (this._queue.length === 0) return;
    var name = this._queue.shift();
    var $dom = $(gestureNameMap[name]);
    $dom.appendTo("body");

    var fadeIn = new Animator($dom[0], {
        properties: [{
            name: "opacity",
            start: 0,
            end: 80,
            unit: "%",
            duration: 100
        }],
        interpolate: Animator.DECELERATE_CUBIC
    });

    var fadeOut = new Animator($dom[0], {
        properties: [{
            name: "opacity",
            start: 80,
            end: 0,
            unit: "%",
            duration: 250
        }],
        interpolate: Animator.DECELERATE_CUBIC
    });

    this._current = fadeIn.animate().then(function() {
        return fadeOut.animate();
    }).then(function() {
        $dom.remove();
    }).bind(this).finally(this._next);
};

GestureScreenFlasher.prototype.flashGesture = function(name) {
    if (this._current) {
        this._queue[0] = name;
        return;
    }
    if (!gestureNameMap[name]) throw new Error("unknown name " + name);
    this._queue.push(name);
    if (!this._current) {
        this._next();
    }
};
