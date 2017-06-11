

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
    this._animationContext = deps.animationContext;
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

    const fadeIn = this._animationContext.createAnimator($dom, {
        opacity: {
            range: [0, 80],
            unit: `%`,
            duration: 100,
            interpolate: this._animationContext.DECELERATE_CUBIC
        }
    });

    const fadeOut = this._animationContext.createAnimator($dom, {
        opacity: {
            range: [80, 0],
            unit: `%`,
            duration: 250,
            interpolate: this._animationContext.DECELERATE_CUBIC
        }
    });

    this._current = (async () => {
        try {
            await fadeIn.start();
            await fadeOut.start();
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
