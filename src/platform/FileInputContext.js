class FileInput {
    constructor(context, properties) {
        this._context = context;
        this._properties = Object(properties);
        this._input = this._createInput();
    }

    page() {
        return this._context.page;
    }

    trigger() {
        if (this._input.chooseDirectory && this._input.directory) {
            this._input.chooseDirectory();
        } else {
            this._input.click();
        }
    }

    _createInput() {
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
    }

    resetFiles() {
        this.page().$(this._input).remove();
        this._input = this._createInput();
    }
}

export default class FileInputContext {
    constructor(deps) {
        this.page = deps.page;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;

    }

    createFileInput(properties) {
        return new FileInput(this, properties);
    }
}
