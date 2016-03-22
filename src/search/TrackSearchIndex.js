"use strict";

import SearchTree from "search/SearchTree";
import SearchTreeEntry from "search/SearchTreeEntry";
import SearchResultRater from "search/SearchResultRater";
import { getSearchTerm } from "search/searchUtil";
import { merge, insert } from "search/sortedArrays";
import SearchResult, { cmp } from "search/SearchResult";
import { getFirstWord, getLastWord, reverseString } from "util";

export default function TrackSearchIndex() {
    this._transientIdToEntry = {};
    this._prefixSearchTree = new SearchTree(SearchTreeEntry.comparer);
    this._suffixSearchTree = new SearchTree(SearchTreeEntry.comparer);
}

TrackSearchIndex.prototype.search = function(normalizedQuery) {
    var suffixQuery = reverseString(normalizedQuery);

    var firstPrefixKeyword = getFirstWord(normalizedQuery);
    var firstSuffixKeyword = getLastWord(suffixQuery);

    var prefixMatches = this._prefixSearchTree.search(firstPrefixKeyword);
    var suffixMatches = this._suffixSearchTree.search(firstSuffixKeyword);

    merge(SearchTreeEntry.comparer, prefixMatches, suffixMatches);
    var results = prefixMatches;
    var ret;

    if (results.length > 0) {
        var rater = new SearchResultRater(normalizedQuery);
        ret = new Array(results.length >> 1);
        ret.length = 0;

        var length = Math.min(results.length, 2500);

        for (var i = 0; i < length; ++i) {
            var result = results[i];
            var distance = rater.getDistanceForSearchTerm(result.searchTerm());
            if (!isFinite(distance)) {
                continue;
            }

            insert(cmp, ret, new SearchResult(result.transientId(), distance));
        }
    } else {
        ret = [];
    }

    return ret;
};

TrackSearchIndex.prototype.add = function(file, metadata, transientId) {
    if (this._transientIdToEntry[transientId]) return;
    this._transientIdToEntry[transientId] = this._addToSearchTree(transientId, metadata, file);
};

TrackSearchIndex.prototype.update = function(transientId, metadata) {
    var entry = this._transientIdToEntry[transientId];
    if (!entry) return;
    this._removeFromSearchTree(entry);
    this._transientIdToEntry[transientId] = this._addToSearchTree(transientId, metadata, null);
};

TrackSearchIndex.prototype._addToSearchTree = function(transientId, metadata, file) {
    var entry = new SearchTreeEntry(transientId, getSearchTerm(metadata, file));
    var keywords = entry.keywords();
    for (var i = 0; i < keywords.length; ++i) {
        var keyword = keywords[i];
        this._prefixSearchTree.insert(keyword, entry);
        this._suffixSearchTree.insert(reverseString(keyword), entry);
    }
    return entry;
};

TrackSearchIndex.prototype._removeFromSearchTree = function(entry) {
    var keywords = entry.keywords();
    for (var i = 0; i < keywords.length; ++i) {
        var keyword = keywords[i];
        this._prefixSearchTree.remove(keyword, entry);
        this._suffixSearchTree.remove(reverseString(keyword), entry);
    }
};

TrackSearchIndex.prototype.remove = function(transientId) {
    var entry = this._transientIdToEntry[transientId];
    if (!entry) return;
    this._removeFromSearchTree(entry);
    delete this._transientIdToEntry[transientId];
};
