function Popup(width, height, opts) {
    EventEmitter.call(this);
    var self = this;
    this._idBase = +(new Date);
    this._popups = {};
    this._lastAdd = null;
    this.length = 0;
    this._width = width;
    this._height = height;
    this._stacks = opts && !!opts.stacks || true;
    this._stackOffsetX = opts && opts.stackOffsetX || 15;
    this._stackOffsetY = opts && opts.stackOffsetY || 15;
    this._closerClass = opts && opts.closerClass || "popup-closer-class";
    this._closeEvents = {};
    $(window)
        .bind("resize", function() {
            var key, popups = self._popups,
                left,
                top, width, height, winWidth = $(window)
                .width(),
                winHeight = $(window)
                .height(),
                popup, offset, id;

            for (key in popups) {

                popup = document.getElementById(key);
                width = parseInt(popup.style.width, 10);
                height = parseInt(popup.style.height, 10);
                offset = popups[key].offset;
                left = (((winWidth - width) / 2) >> 0) + offset * self._stackOffsetX;
                top = (((winHeight - height) / 2) >> 0) + offset * self._stackOffsetY;
                left = left < 0 ? 0 : left;
                top = top < 0 ? 0 : top;
                popup.style.left = left + "px";
                popup.style.top = top + "px";
            }
        });

    $(document)
        .delegate("." + this._closerClass.split(" ")[0], "click", function() {
            self.close.call(self, this);
        });

    this._className = opts && opts.addClass || "popup-main";
};
util.inherits(Popup, EventEmitter);

Popup.prototype.closeEvent = function(fn, id) {
    id = id || this._lastAdd;
    this._closeEvents[id] = fn;
};

Popup.prototype.closeAll = function() {
    if (!this.length) {
        return false;
    }
    var key, popups = this._popups;
    for (key in popups) {
        $("#" + key)
            .remove();
    }
    this._popups = {};
    this._lastAdd = null;
    this.length = 0;
    for (key in this._closeEvents) {
        this._closeEvents[key]();
        delete this._closeEvents[key];
    }
    this.emit("close");
    return this;
};

Popup.prototype.close = function(elm) {

    var node = elm,
        popup, className = this._className,
        popups = this._popups,
        l = popups.length,
        id, obj;
    if (!elm && this._lastAdd !== null) {
        node = $("#" + (this._lastAdd));

        delete popups[this._lastAdd];
        $(node)
            .remove();
        this.length--;
        if (typeof this._closeEvents[this._lastAdd] ==
            "function") {
            this._closeEvents[this._lastAdd]();
            delete this._closeEvents[this._lastAdd];
        }
        this.emit("close");
    } else {
        while (node) {

            if ((" " + node.className + " ")
                .indexOf(className) > -1) {
                popup = node;
                break;
            }
            node = node.parentNode;
        }

        if (popup && popups[popup.id]) {

            $(popup)
                .remove();
            delete popups[popup.id];
            this.length--;
            if (typeof this._closeEvents[popup.id] ==
                "function") {
                this._closeEvents[popup.id]();
                delete this._closeEvents[popup.id];
            }
            this.emit("close");
        }
    }

    if (!this.length) {
        this._lastAdd = null;
    } else {
        this._lastAdd = $("." + this._className)
            .last()[0].id;
    }
    return this;
};

Popup.prototype.open = function(html, width, height) {
    var div = document.createElement("div"),
        id, top, left,
        winWidth = $(window)
        .width(),
        winHeight = $(window)
        .height(),
        width = width || this._width,
        height = height || this._height,
        offset = this._stacks ? this.length : 0,
        closerDiv = document.createElement("div"),
        contentDelay, self = this,
        $div;

    id = "popup-" + (++this._idBase);
    left = (((winWidth - width) / 2) >> 0) + offset * this._stackOffsetX;
    top = (((winHeight - height) / 2) >> 0) + offset * this._stackOffsetY;
    left = left < 0 ? 0 : left;
    top = top < 0 ? 0 : top;
    div.id = id;
    closerDiv.className = this._closerClass;
    div.appendChild(closerDiv);
    div.className = this._className;
    div.setAttribute("style", "width:" + width + "px;height:" +
        height + "px;position:absolute;top:" + top +
        "px;left:" + left + "px;z-index:" + (100000 +
            offset) + ";display:block;");
    $div = $(div);
    $div.appendTo("body");
    this.emit("beforeOpen", id);
    this._popups[id] = {
        width: width,
        height: height,
        offset: offset
    };
    this._lastAdd = id;
    this.length++;
    $div.append(html);
    this.emit("open");
    return this;
};

Popup.prototype.html = function(html, elm) {
    elm = elm || (this._lastAdd && document.getElementById(this
        ._lastAdd));
    if (!elm) {
        return null;
    }
    elm.innerHTML = html;
    return elm;
};
