"use strict";

function FileInput(context, dom, properties) {
    this._nodes = dom;
    this._context = context;
    this._properties = Object(properties);
    this._clicked = this._clicked.bind(this);
    this._mousedowned = this._mousedowned.bind(this);
    this._input = this._createInput();
    this._tapRecognizer = context.recognizerContext.createTapRecognizer(this._clicked);

    var self = this;
    this.$().forEach(function(elem) {
        elem.addEventListener("click", self._clicked);
        elem.addEventListener("mousedown", self._mousedowned);
        self._tapRecognizer.recognizeBubbledOn(elem);
    });
}

FileInput.prototype.$ = function() {
    return this._nodes;
};

FileInput.prototype._mousedowned = function(e) {
    e.preventDefault();
};

FileInput.prototype._clicked = function() {
    if (this._input.chooseDirectory && this._input.directory) {
        this._input.chooseDirectory();
    } else {
        this._input.click();
    }
};

FileInput.prototype._createInput = function() {
    return this.page().createElement("input")
        .setProperties(this._properties)
        .setProperties({
            type: "file",
            tabIndex: -1
        })
        .setStyles({
            position: "absolute",
            top: "-9999px",
            left: "-9999px"
        })
        .appendTo("body")
        .get(0);
};

FileInput.prototype.resetFiles = function() {
    this.page().$(this._input).remove();
    this._input = this._createInput();
};

FileInput.prototype.page = function() {
    return this._context.page;
};

export default function FileInputContext(page, recognizerContext, rippler) {
    this.page = page;
    this.recognizerContext = recognizerContext;
    this.rippler = rippler;
}

FileInputContext.prototype.createFileInput = function(dom, properties) {
    return new FileInput(this, dom, properties);
};
