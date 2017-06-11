export default function TrackViewOptions(updateTrackIndex,
    itemHeight, playlist, page, tooltipContext, selectable, search) {
    this.updateTrackIndex = updateTrackIndex;
    this.itemHeight = itemHeight;
    this.playlist = playlist;
    this.page = page;
    this.tooltipContext = tooltipContext;
    this.selectable = selectable;
    this.search = search;
    Object.freeze(this);
}
