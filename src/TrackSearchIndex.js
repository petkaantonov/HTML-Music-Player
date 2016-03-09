"use strict";

const SearchTree = require("lib/SearchTree");
const SearchTreeEntry = require("SearchTreeEntry");
const searchUtil = require("searchUtil");
const sortedArrays = require("lib/sortedArrays");
const util = require("lib/util");

function TrackSearchIndex() {
    this._uidToSearchTreeEntry = {};
    this._prefixSearchTree = new SearchTree(SearchTreeEntry.comparer);
    this._suffixSearchTree = new SearchTree(SearchTreeEntry.comparer);
}

TrackSearchIndex.prototype.search = function(normalizedQuery) {
    var suffixQuery = util.reverseString(normalizedQuery);

    var firstPrefixKeyword = util.getFirstWord(normalizedQuery);
    var firstSuffixKeyword = util.getLastWord(suffixQuery);

    var prefixMatches = this._prefixSearchTree.search(firstPrefixKeyword);
    var suffixMatches = this._suffixSearchTree.search(firstSuffixKeyword);

    sortedArrays.merge(SearchTreeEntry.comparer, prefixMatches, suffixMatches);
    var results = prefixMatches;

    if (results.length > 0 && firstPrefixKeyword.length < normalizedQuery.length) {
        var ret = new Array(results.length >> 1);
        ret.length = 0;
        var matchers = normalizedQuery.split(" ");
        matchers.shift();

        for (var i = 0; i < matchers.length; ++i) {
            matchers[i] = new RegExp("\\b" + matchers[i] + "|" + matchers[i] + "\\b", "g");
        }

        var length = Math.min(results.length, 2500);
        refinementLoop: for (var i = 0; i < length; ++i) {
            var result = results[i];
            var searchTerm = result.searchTerm();
            var distance = 0;
            var fullMatchIndex = searchTerm.indexOf(normalizedQuery);
            if (fullMatchIndex >= 0) {
                // Ensure all exact matches go to the beginning.
                distance = -999999 + fullMatchIndex;
            } else {
                for (var j = 0; j < matchers.length; ++j) {
                    var matcher = matchers[j];
                    if (!matcher.test(searchTerm)) {
                        continue refinementLoop;
                    }
                    distance += matcher.lastIndex;
                    matcher.lastIndex = 0;
                }
            }
            result.setDistance(distance);
            ret.push(result);
        }

        ret.sort(SearchTreeEntry.distanceCompare);
        results = ret;
    }

    for (var i = 0; i < results.length; ++i) {
        results[i] = results[i].uid();
    }
    return results;
};

TrackSearchIndex.prototype.add = function(file, metadata) {
    var uid = searchUtil.calculateUid(file, metadata, false);
    if (this._uidToSearchTreeEntry[uid]) return;
    this._uidToSearchTreeEntry[uid] = this._addToSearchTree(uid, metadata, file);
};

TrackSearchIndex.prototype.update = function(uid, metadata) {
    var entry = this._uidToSearchTreeEntry[uid];
    if (!entry) return;
    this._removeFromSearchTree(entry);
    this._uidToSearchTreeEntry[uid] = this._addToSearchTree(uid, metadata, null);
};

TrackSearchIndex.prototype._addToSearchTree = function(uid, metadata, file) {
    var entry = new SearchTreeEntry(uid, searchUtil.getSearchTerm(metadata, file));
    var keywords = entry.keywords();
    for (var i = 0; i < keywords.length; ++i) {
        var keyword = keywords[i];
        this._prefixSearchTree.insert(keyword, entry);
        this._suffixSearchTree.insert(util.reverseString(keyword), entry);
    }
    return entry;
};

TrackSearchIndex.prototype._removeFromSearchTree = function(entry) {
    var keywords = entry.keywords();
    for (var i = 0; i < keywords.length; ++i) {
        var keyword = keywords[i];
        this._prefixSearchTree.remove(keyword, entry);
        this._suffixSearchTree.remove(util.reverseString(keyword), entry);
    }
};

TrackSearchIndex.prototype.remove = function(file, metadata) {
    var uid = searchUtil.calculateUid(file, metadata, false);
    var entry = this._uidToSearchTreeEntry[uid];
    if (!entry) return;
    this._removeFromSearchTree(entry);
    delete this._uidToSearchTreeEntry[uid];
};

module.exports = TrackSearchIndex;
