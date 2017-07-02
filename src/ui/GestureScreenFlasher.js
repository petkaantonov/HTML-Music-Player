import {DECELERATE_CUBIC} from "ui/animation/easing";
import {animationPromisify} from "util";

const fadeInAnimationOptions = {
    fill: `both`,
    easing: DECELERATE_CUBIC,
    duration: 100
};

const fadeOutAnimationOptions = {
    fill: `both`,
    easing: DECELERATE_CUBIC,
    duration: 250,
    direction: `reverse`
};

const fadeKeyFrames = [{
    opacity: 0
}, {
    opacity: 0.8
}];

const gestureIcon = function(icon) {
    return `<div class="gesture-flash"><span class="gesture-flash-icon ${icon}"></span></div>`;
};

const gestureNameMap = {
    play: gestureIcon(`glyphicon glyphicon-play`),
    pause: gestureIcon(`glyphicon glyphicon-pause`),
    next: gestureIcon(`glyphicon glyphicon-step-forward`),
    previous: gestureIcon(`glyphicon glyphicon-step-backward`)
};

export default function GestureScreenFlasher(deps) {
    this._page = deps.page;
    this._queue = [];
    this._current = null;
    this._gestureMap = {};
    Object.keys(gestureNameMap).forEach(function(key) {
        this._gestureMap[key] = this._page.parse(gestureNameMap[key]);
    }, this);

}

GestureScreenFlasher.prototype._next = function() {
    this._current = null;
    if (this._queue.length === 0) return;
    const name = this._queue.shift();
    const $dom = this._gestureMap[name].remove().removeAttribute(`style`);
    $dom.appendTo(`body`);

    const fadeIn = $dom.animate(fadeKeyFrames, fadeInAnimationOptions);
    fadeIn.pause();

    const fadeOut = $dom.animate(fadeKeyFrames, fadeOutAnimationOptions);
    fadeOut.pause();

    this._current = (async () => {
        try {
            fadeIn.play();
            await animationPromisify(fadeIn);
            fadeOut.play();
            await animationPromisify(fadeOut);
            $dom.remove().removeAttribute(`style`);
        } finally {
            this._next();
        }
    })();
};

GestureScreenFlasher.prototype.flashGesture = function(name) {
    if (this._current) {
        this._queue[0] = name;
        return;
    }
    if (!gestureNameMap[name]) throw new Error(`unknown name ${name}`);
    this._queue.push(name);
    if (!this._current) {
        this._next();
    }
};
