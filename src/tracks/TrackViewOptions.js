"use strict";

import { ensureType } from "util";

export default function TrackViewOptions(updateTrackIndex,
    itemHeight, playlist, page, tooltipContext, selectable, search) {
    this.updateTrackIndex = ensureType(updateTrackIndex, "boolean");
    this.itemHeight = ensureType(itemHeight, "integer");
    this.playlist = ensureType(playlist, "object");
    this.page = ensureType(page, "object");
    this.tooltipContext = ensureType(tooltipContext, "object");
    this.selectable = ensureType(selectable, "object");
    this.search = search;
    Object.freeze(this);
}
