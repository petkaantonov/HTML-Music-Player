function TrackDisplay(target, opts) {
    var parent;
    target = typeof target == "string" ? document.getElementById(target) :
        target;

    if (target.id == null) {
        target.id = (+new Date) + "-track-display";
    }

    parent = target.parentNode;

    if (!parent || !target) {
        throw new TypeError(
            "TrackDisplay needs a scroll parent and a content target");
        return false;
    }

    if (parent && !parent.id) {
        parent.id = (+new Date) + "-track-display-parent";
    }

    this._target = target.id;
    this._scrollParent = parent.id;
    this._marqDelay = (opts && opts.delay || 2.5) * 1000;
    this._pixelsPerSecond = 15;
    this._frameRequest = null;
    this._amounts = 0;
    this._direction = "right";
    this._scrollWidth = 0;
};

TrackDisplay.prototype.newTitle = function(titleName) {
    $(document.getElementById(this._target)).text(titleName);
    document.title = titleName;
    return this;
};

TrackDisplay.prototype.__marquer = function() {
    var target = document.getElementById(this._scrollParent),
        self = this,
        progress = this._direction == "right" ? 1 : -1;

    var last = -1
    var updateTime = 1000 / this._pixelsPerSecond;
    this._frameRequest = requestAnimationFrame(function animate(now) {
        self._frameRequest = null;
        var diff = last === -1 ? updateTime : now - last;
        last = now;
        self._amounts += (diff / updateTime) * progress;
        target.scrollLeft = self._amounts;
        if (self._amounts > self._scrollWidth || self._amounts < 0) {
            self._direction = self._amounts < 0 ? "right" : "left";
            window.setTimeout(function() {
                self.beginMarquee();
            }, self._marqDelay);
        } else {
            self._frameRequest = requestAnimationFrame(animate);
        }
    });
    return this;
};

TrackDisplay.prototype.beginMarquee = function() {
    var scrollParent = document.getElementById(this._scrollParent),
        sWidth = scrollParent.scrollWidth,
        oWidth = scrollParent.offsetWidth;

    if (sWidth - oWidth < 1) {
        return this;
    }

    this._scrollWidth = sWidth - oWidth;
    if (this._frameRequest) {
        cancelAnimationFrame(this._frameRequest);
        this._frameRequest = null;
    }

    return this.__marquer();
};

TrackDisplay.prototype.stopMarquee = function() {
    if (this._frameRequest) {
        cancelAnimationFrame(this._frameRequest);
        this._frameRequest = null;
    }
    return this;
};
