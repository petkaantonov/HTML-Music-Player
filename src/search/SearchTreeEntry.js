

export default function SearchTreeEntry(transientId, searchTerm) {
    this._transientId = transientId;
    this._searchTerm = searchTerm;
}

SearchTreeEntry.prototype.keywords = function() {
    if (!this._searchTerm.length) return [];
    return this._searchTerm.split(` `);
};


SearchTreeEntry.prototype.transientId = function() {
    return this._transientId;
};

SearchTreeEntry.prototype.searchTerm = function() {
    return this._searchTerm;
};

SearchTreeEntry.comparer = function(a, b) {
    return a._transientId - b._transientId;
};
