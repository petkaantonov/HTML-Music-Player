"use strict";

const util = require("lib/util");
const sha1 = require("lib/sha1");

const calculateUid = function(file, metadata) {
    var title = metadata.taggedTitle || metadata.title || null;
    var album = metadata.taggedAlbum || metadata.album || null;
    var artist = metadata.taggedArtist || metadata.artist || null;
    var index = metadata.albumIndex || -1;
    var name = file.name;
    var size = file.size;
    return sha1("" + album + title + artist + index + name + size);
};

function SearchableTrack(file, metadata, track) {
    this._destroyed = false;
    this._uid = calculateUid(file, metadata);
    this._metadata = metadata;
    this._filename = file.name;
    this._track = track;
    this._searchTerm = null;
}

SearchableTrack.prototype.matches = function(matchers) {
    if (!this._searchTerm) {
        var unique = {};
        var title = util.normalizeQuery(this._metadata.taggedTitle || this._metadata.title || "");
        var album = util.normalizeQuery(this._metadata.taggedAlbum || this._metadata.album || "");
        var artist = util.normalizeQuery(this._metadata.taggedArtist || this._metadata.artist || "");
        var genres = this._metadata.genres;
        if (genres) genres = util.normalizeQuery(genres.join(" "));
        var searchTerms = title.split(" ").concat(album.split(" "), artist.split(" "), genres.split(" "));
        for (var i = 0; i < searchTerms.length; ++i) {
            unique[searchTerms[i]] = true;
        }
        this._searchTerm = Object.keys(unique).join(" ");
    }

    for (var i = 0; i < matchers.length; ++i) {
        if (!matchers[i].test(this._searchTerm)) {
            return false;
        }
    }
    return true;
};

SearchableTrack.prototype.track = function() {
    return this._track;
};

SearchableTrack.prototype.isSearchable = function() {
    return !this._destroyed;
};

SearchableTrack.prototype.destroy = function() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._track = null;
};

SearchableTrack.prototype.uid = function() {
    return this._uid;
};

function SearchableTracks() {
    this._uidToSearchableTrack = {};
    this._searchableTracks = [];
    this._pendingRemovals = 0;
}

SearchableTracks.prototype.getSearchableTracks = function() {
    return this._searchableTracks;
};

SearchableTracks.prototype.calculateUid = calculateUid;

SearchableTracks.prototype.add = function(file, metadata, track) {
    var searchableTrack = new SearchableTrack(file, metadata, track);
    var uid = searchableTrack.uid();

    if (this._uidToSearchableTrack[uid]) {
        searchableTrack.destroy();
        return;
    }

    this._uidToSearchableTrack[uid] = searchableTrack;
    this._searchableTracks.push(searchableTrack);
};

SearchableTracks.prototype.getTrackByUid = function(uid) {
    var searchableTrack = this._uidToSearchableTrack[uid];
    if (searchableTrack) {
        return searchableTrack.track() || null;
    }
    return null;
};

SearchableTracks.prototype.trackMatches = function(track, matchers) {
    var searchableTrack = this._uidToSearchableTrack[track.getUid()];
    if (searchableTrack) {
        return searchableTrack.matches(matchers);
    }
    return false;
};

SearchableTracks.prototype.remove = function(uid) {
    var searchableTrack = this._uidToSearchableTrack[uid];
    if (searchableTrack) {
        searchableTrack.destroy();
        this._pendingRemovals++;
        delete this._uidToSearchableTrack[uid];

        if (this._pendingRemovals > 100) {
            var newSearchableTracks = new Array(this._searchableTracks.length - this._pendingRemovals);
            this._pendingRemovals = 0;
            var j = 0;
            for (var i = 0; i < this._searchableTracks.length; ++i) {
                var searchableTrack = this._searchableTracks[i];
                if (searchableTrack.isSearchable()) {
                    newSearchableTracks[j++] = searchableTrack;
                }
            }
            this._searchableTracks = newSearchableTracks;
        }
    }
};

module.exports = new SearchableTracks();
