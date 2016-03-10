"use strict";

function SearchTreeEntry(transientId, searchTerm) {
    this._transientId = transientId;
    this._searchTerm = searchTerm;
    this._distance = 0;
}

SearchTreeEntry.prototype.keywords = function() {
    if (!this._searchTerm.length) return [];
    return this._searchTerm.split(" ");
};

SearchTreeEntry.prototype.setDistance = function(distance) {
    this._distance = distance;
};

SearchTreeEntry.prototype.distance = function() {
    return this._distance;
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

SearchTreeEntry.distanceCompare = function(a, b) {
    return a._distance - b._distance;
};

module.exports = SearchTreeEntry;
