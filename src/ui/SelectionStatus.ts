import { SelectDeps } from "Application";
import EventEmitter from "eventsjs";
import Page, { DomWrapper, DomWrapperSelector } from "platform/dom/Page";
import { EventEmitterInterface } from "types/helpers";
import { ABOVE_TOOLBAR_Z_INDEX } from "ui/ToolbarManager";

import { shortNumber } from "../util";
import GestureObject from "./gestures/GestureObject";
import GestureRecognizerContext from "./gestures/GestureRecognizerContext";
import Rippler from "./Rippler";

type Deps = SelectDeps<"page" | "recognizerContext" | "rippler">;

interface Opts {
    countDisplay: DomWrapperSelector;
    closeButton: DomWrapperSelector;
    selectAllButton: DomWrapperSelector;
    menuButton: DomWrapperSelector;
}

export default interface SelectionStatus
    extends EventEmitterInterface<{
        unselectAll: () => void;
        selectAll: () => void;
        nonEmptySelection: (count: number, animation: boolean) => void;
        emptySelection: (count: number, animation: boolean) => void;
        menuClick: (e: GestureObject | MouseEvent) => void;
    }> {}

export default class SelectionStatus extends EventEmitter {
    private _page: Page;
    private _recognizerContext: GestureRecognizerContext;
    private _rippler: Rippler;
    private _countDisplay: DomWrapper;
    private _closeButton: DomWrapper;
    private _selectAllButton: DomWrapper;
    private _menuButton: DomWrapper;
    private _selectionCount: number;
    private _canSelectAll: boolean;
    constructor(opts: Opts, deps: Deps) {
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
        this._recognizerContext.createTapRecognizer(this._closeButtonClicked).recognizeBubbledOn(this.$closeButton());
        this._recognizerContext.createTapRecognizer(this._menuButtonClicked).recognizeBubbledOn(this.$menuButton());
        this._recognizerContext
            .createTapRecognizer(this._selectAllButtonClicked)
            .recognizeBubbledOn(this.$selectAllButton());
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

    _closeButtonClicked = () => {
        this.emit(`unselectAll`);
    };

    _selectAllButtonClicked = (e: MouseEvent | GestureObject) => {
        this._rippler.rippleElement(
            e.currentTarget as HTMLElement,
            e.clientX,
            e.clientY,
            undefined,
            ABOVE_TOOLBAR_Z_INDEX
        );
        if (!this._canSelectAll) {
            return;
        }
        this.emit(`selectAll`);
    };

    _menuButtonClicked = (e: MouseEvent | GestureObject) => {
        this._rippler.rippleElement(
            e.currentTarget as HTMLElement,
            e.clientX,
            e.clientY,
            undefined,
            ABOVE_TOOLBAR_Z_INDEX
        );
        this.emit(`menuClick`, e);
    };

    getSelectionCount() {
        return this._selectionCount;
    }

    setSelectionCount(count: number, maxCount: number, animationAppropriate: boolean = true) {
        const previousCount = this._selectionCount;
        this._selectionCount = count;
        this._canSelectAll = count < maxCount;
        this.$countDisplay().setText(shortNumber(this._selectionCount));
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
