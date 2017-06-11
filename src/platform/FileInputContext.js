

function FileInput(context, dom, properties) {
    this._nodes = dom;
    this._context = context;
    this._properties = Object(properties);
    this._clicked = this._clicked.bind(this);
    this._mousedowned = this._mousedowned.bind(this);
    this._input = this._createInput();
    this._tapRecognizer = context.recognizerContext.createTapRecognizer(this._clicked);

    this.$().forEach((elem) => {
        elem.addEventListener(`click`, this._clicked);
        elem.addEventListener(`mousedown`, this._mousedowned);
        this._tapRecognizer.recognizeBubbledOn(elem);
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
    return this.page().createElement(`input`).
        setProperties(this._properties).
        setProperties({
            type: `file`,
            tabIndex: -1
        }).
        setStyles({
            position: `absolute`,
            top: `-9999px`,
            left: `-9999px`
        }).
        appendTo(`body`).
        get(0);
};

FileInput.prototype.resetFiles = function() {
    this.page().$(this._input).remove();
    this._input = this._createInput();
};

FileInput.prototype.page = function() {
    return this._context.page;
};

export default function FileInputContext(deps) {
    this.page = deps.page;
    this.recognizerContext = deps.recognizerContext;
    this.rippler = deps.rippler;

}

FileInputContext.prototype.createFileInput = function(dom, properties) {
    return new FileInput(this, dom, properties);
};
