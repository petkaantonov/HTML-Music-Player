function BlockingPopup() {
    Popup.apply(this, Array.prototype.slice.call(arguments, 0));
    this._blockerId = "blocker-" + (+new Date);
};
util.inherits(BlockingPopup, Popup);

BlockingPopup.prototype.closeAll = function() {
    if (!this.closeAll$()) {
        return false;
    }
    $("#" + this._blockerId).remove();
    return this;
};

BlockingPopup.prototype.open = function(html, width, height) {
    this.open$(html, width, height);

    if (this.length < 2) {
        $("<div id=\"" + this._blockerId +
                "\"style=\"background-color:rgba(0, 0, 0, 0.2);position:absolute;" +
                "top:0px;left:0px;z-index:99999;display:block;width:" +
                $(window)
                .width() + "px;" +
                "height:" + $(window)
                .height() + "px;\"></div>")
            .prependTo("body").one("click", this.closeAll.bind(this));
    }
    return this;
};

BlockingPopup.prototype.close = function(elm) {
    this.close$(elm);
    if (!this.length) {
        $("#" + this._blockerId)
            .remove();
    }
    return this;
};
