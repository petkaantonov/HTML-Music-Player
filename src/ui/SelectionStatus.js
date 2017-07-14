import EventEmitter from "events";
import {ABOVE_TOOLBAR_Z_INDEX} from "ui/ToolbarManager";


export default class SelectionStatus extends EventEmitter {
    constructor(opts, deps) {
        super();
        this._page = deps.page;
        this._recognizerContext = deps.recognizerContext;
        this._rippler = deps.rippler;
        this._countDisplay = this._page.$(opts.countDisplay);
        this._closeButton = this._page.$(opts.closeButton);
        this._selectAllButton = this._page.$(opts.selectAllButton);
        this._menuButton = this._page.$(opts.menuButton);
        this._selectionCount = 0;
        this._canSelectAll = false;
        this._recognizerContext.createTapRecognizer(this._closeButtonClicked.bind(this)).recognizeBubbledOn(this.$closeButton());
        this._recognizerContext.createTapRecognizer(this._menuButtonClicked.bind(this)).recognizeBubbledOn(this.$menuButton());
        this._recognizerContext.createTapRecognizer(this._selectAllButtonClicked.bind(this)).recognizeBubbledOn(this.$selectAllButton());
        this._updateSelectAllButtonState();
    }

    $countDisplay() {
        return this._countDisplay;
    }

    $closeButton() {
        return this._closeButton;
    }

    $menuButton() {
        return this._menuButton;
    }

    $selectAllButton() {
        return this._selectAllButton;
    }

    _updateSelectAllButtonState() {
        if (this._canSelectAll) {
            this.$selectAllButton().removeClass(`disabled`);
        } else {
            this.$selectAllButton().addClass(`disabled`);
        }
    }

    _closeButtonClicked() {
        this.emit(`unselectAll`);
    }

    _selectAllButtonClicked(e) {
        this._rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, ABOVE_TOOLBAR_Z_INDEX);
        if (!this._canSelectAll) {
            return;
        }
        this.emit(`selectAll`);
    }

    _menuButtonClicked(e) {
        this._rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, ABOVE_TOOLBAR_Z_INDEX);
        this.emit(`menuClick`, e);
    }

    getSelectionCount() {
        return this._selectionCount;
    }

    setSelectionCount(count, maxCount, animationAppropriate = true) {
        const previousCount = this._selectionCount;
        this._selectionCount = count;
        this._canSelectAll = count < maxCount;
        this.$countDisplay().setText(this._selectionCount);
        this._updateSelectAllButtonState();
        if (count > 0) {
            if (previousCount === 0) {
                this.emit(`nonEmptySelection`, count, animationAppropriate);
            }
        } else if (count === 0) {
            if (previousCount > 0) {
                this.emit(`emptySelection`, 0, animationAppropriate);
            }
        }

    }

}
