export default class TrackViewOptions {
    constructor(itemHeight, page, selectable, hasTouch) {
        this.itemHeight = itemHeight;
        this.page = page;
        this.selectable = selectable;
        this.hasTouch = hasTouch;
        Object.freeze(this);
    }
}
