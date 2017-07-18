

export function cmp(a, b) {
    const ret = a.distance - b.distance;
    if (ret === 0) {
        return a.transientId - b.transientId;
    }
    return ret;
}

export default class SearchResult {
    constructor(transientId, distance) {
        this.transientId = transientId;
        this.distance = distance;
    }
}
