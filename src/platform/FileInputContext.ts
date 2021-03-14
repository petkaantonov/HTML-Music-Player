import { SelectDeps } from "Application";
import GestureRecognizerContext from "ui/gestures/GestureRecognizerContext";
import Rippler from "ui/Rippler";

import Page from "./dom/Page";

type Opts = Partial<HTMLInputElement>;

export class FileInput {
    private _context: FileInputContext;
    private _properties: Opts;
    private _input: HTMLInputElement;
    constructor(context: FileInputContext, properties: Opts) {
        this._context = context;
        this._properties = properties;
        this._input = this._createInput();
    }

    page() {
        return this._context.page;
    }

    trigger() {
        this._input.click();
    }

    _createInput() {
        return this.page()
            .createElement(`input`)
            .setProperties<HTMLInputElement>(this._properties)
            .setProperties<HTMLInputElement>({
                type: `file`,
                tabIndex: -1,
            })
            .setStyles({
                position: `absolute`,
                top: `-9999px`,
                left: `-9999px`,
            })
            .appendTo(`body`)
            .get(0)! as HTMLInputElement;
    }

    resetFiles() {
        this.page().$(this._input).remove();
        this._input = this._createInput();
    }
}

type Deps = SelectDeps<"page" | "recognizerContext" | "rippler">;

export default class FileInputContext {
    page: Page;
    recognizerContext: GestureRecognizerContext;
    rippler: Rippler;
    constructor(deps: Deps) {
        this.page = deps.page;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;
    }

    createFileInput(properties: Opts) {
        return new FileInput(this, properties);
    }
}
