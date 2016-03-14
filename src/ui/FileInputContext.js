"use strict";

import $ from "jquery";

function FileInput(context, dom, attributes) {
    this._nodes = dom;
    this._context = context;
    this._attributes = Object(attributes);
    this._clicked = this._clicked.bind(this);
    this._mousedowned = this._mousedowned.bind(this);
    this._input = this._createInput();
    this._tapRecognizer = context.recognizerMaker.createTapRecognizer(this._clicked);

    var self = this;
    this.$().each(function() {
        $(this).on("click", self._clicked);
        $(this).on("mousedown", self._mousedowned);
        self._tapRecognizer.recognizeBubbledOn($(this));
    });
}

FileInput.prototype.$ = function() {
    return this._nodes;
};

FileInput.prototype._mousedowned = function(e) {
    e.preventDefault();
};

FileInput.prototype._clicked = function(e) {
    this._context.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    if (this._input.chooseDirectory && this._input.directory) {
        this._input.chooseDirectory();
    } else {
        this._input.click();
    }
};

FileInput.prototype._createInput = function() {
    var input = document.createElement("input");
    Object.keys(this._attributes).forEach(function(key) {
        input[key] = this._attributes[key];
    }, this);
    input.type = "file";
    input.tabIndex = -1;

    $(input).css({
        position: "absolute",
        top: "-9999px",
        left: "-9999px"
    });
    $("body").append(input);
    return input;
};

FileInput.prototype.resetFiles = function() {
    $(this._input).remove();
    this._input = this._createInput();
};

export default function FileInputContext(recognizerMaker, rippler) {
    this.recognizerMaker = recognizerMaker;
    this.rippler = rippler;
}

FileInputContext.prototype.createFileInput = function(dom, attributes) {
    return new FileInput(this, dom, attributes);
};
