export default class TrackViewOptions {
    constructor(itemHeight, page, selectable, hasTouch, controller) {
        this.itemHeight = itemHeight;
        this.page = page;
        this.selectable = selectable;
        this.hasTouch = hasTouch;
        this.controller = controller;
        Object.freeze(this);
    }
}
