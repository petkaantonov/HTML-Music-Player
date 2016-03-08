"use strict";
var nextObjId = 0;

function SearchTreeEntry(uid, searchTerm) {
    this._uid = uid;
    this._id = ((++nextObjId) + "-id");
    this._searchTerm = searchTerm;
}

SearchTreeEntry.prototype.hash = function() {
    return this._id;
};

SearchTreeEntry.prototype.uid = function() {
    return this._uid;
};

SearchTreeEntry.prototype.searchTerm = function() {
    return this._searchTerm;
};

module.exports = SearchTreeEntry;
