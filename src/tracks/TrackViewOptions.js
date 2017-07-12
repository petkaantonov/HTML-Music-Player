export default function TrackViewOptions(updateTrackIndex,
    itemHeight, playlist, page, tooltipContext, selectable, search, hasTouch) {
    this.updateTrackIndex = updateTrackIndex;
    this.itemHeight = itemHeight;
    this.playlist = playlist;
    this.page = page;
    this.tooltipContext = tooltipContext;
    this.selectable = selectable;
    this.search = search;
    this.hasTouch = hasTouch;
    Object.freeze(this);
}
