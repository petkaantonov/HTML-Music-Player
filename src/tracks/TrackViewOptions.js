export default class TrackViewOptions {
    constructor(itemHeight, playlist, page, tooltipContext, selectable, search, hasTouch) {
        this.itemHeight = itemHeight;
        this.playlist = playlist;
        this.page = page;
        this.tooltipContext = tooltipContext;
        this.selectable = selectable;
        this.search = search;
        this.hasTouch = hasTouch;
        Object.freeze(this);
    }
}
