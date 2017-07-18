

export default class SearchTreeEntry {
    constructor(transientId, searchTerm) {
        this._transientId = transientId;
        this._searchTerm = searchTerm;
    }

    keywords() {
        if (!this._searchTerm.length) return [];
        return this._searchTerm.split(` `);
    }


    transientId() {
        return this._transientId;
    }

    searchTerm() {
        return this._searchTerm;
    }
}

SearchTreeEntry.comparer = function(a, b) {
    return a._transientId - b._transientId;
};
