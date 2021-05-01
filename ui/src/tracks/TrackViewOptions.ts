import Page from "ui/platform/dom/Page";
import Selectable from "ui/ui/Selectable";

import TrackContainerController from "./TrackContainerController";

export default class TrackViewOptions {
    readonly itemHeight: number;
    readonly page: Page;
    readonly selectable: Selectable;
    readonly hasTouch: boolean;
    readonly controller: TrackContainerController<any>;
    constructor(
        itemHeight: number,
        page: Page,
        selectable: Selectable,
        hasTouch: boolean,
        controller: TrackContainerController<any>
    ) {
        this.itemHeight = itemHeight;
        this.page = page;
        this.selectable = selectable;
        this.hasTouch = hasTouch;
        this.controller = controller;
    }
}
