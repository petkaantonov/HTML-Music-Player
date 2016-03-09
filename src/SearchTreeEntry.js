"use strict";
var nextObjId = 0;

function SearchTreeEntry(uid, searchTerm) {
    this._uid = uid;
    this._id = ++nextObjId;
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

SearchTreeEntry.prototype.uid = function() {
    return this._uid;
};

SearchTreeEntry.prototype.searchTerm = function() {
    return this._searchTerm;
};

SearchTreeEntry.comparer = function(a, b) {
    return a._id - b._id;
};

SearchTreeEntry.distanceCompare = function(a, b) {
    return a._distance - b._distance;
};

module.exports = SearchTreeEntry;
