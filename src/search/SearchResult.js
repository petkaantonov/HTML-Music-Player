"use strict";

export function cmp(a, b) {
    var ret = a.distance - b.distance;
    if (ret === 0) {
        return a.transientId - b.transientId;
    }
    return ret;
}

export default function SearchResult(transientId, distance) {
    this.transientId = transientId;
    this.distance = distance;
}
