

import SearchTree from "search/SearchTree";
import SearchTreeEntry from "search/SearchTreeEntry";
import SearchResultRater from "search/SearchResultRater";
import {getSearchTerm} from "search/searchUtil";
import {merge, insert} from "search/sortedArrays";
import SearchResult, {cmp} from "search/SearchResult";
import {getFirstWord, getLastWord, reverseString} from "util";

export default function TrackSearchIndex() {
    this._transientIdToEntry = {};
    this._prefixSearchTree = new SearchTree(SearchTreeEntry.comparer);
    this._suffixSearchTree = new SearchTree(SearchTreeEntry.comparer);
}

TrackSearchIndex.prototype.search = function(normalizedQuery) {
    const suffixQuery = reverseString(normalizedQuery);

    const firstPrefixKeyword = getFirstWord(normalizedQuery);
    const firstSuffixKeyword = getLastWord(suffixQuery);

    const prefixMatches = this._prefixSearchTree.search(firstPrefixKeyword);
    const suffixMatches = this._suffixSearchTree.search(firstSuffixKeyword);

    merge(SearchTreeEntry.comparer, prefixMatches, suffixMatches);
    const results = prefixMatches;
    let ret;

    if (results.length > 0) {
        const rater = new SearchResultRater(normalizedQuery);
        ret = new Array(results.length >> 1);
        ret.length = 0;

        const length = Math.min(results.length, 2500);

        for (let i = 0; i < length; ++i) {
            const result = results[i];
            const distance = rater.getDistanceForSearchTerm(result.searchTerm());
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
    const entry = this._transientIdToEntry[transientId];
    if (!entry) return;
    this._removeFromSearchTree(entry);
    this._transientIdToEntry[transientId] = this._addToSearchTree(transientId, metadata, null);
};

TrackSearchIndex.prototype._addToSearchTree = function(transientId, metadata, file) {
    const entry = new SearchTreeEntry(transientId, getSearchTerm(metadata, file));
    const keywords = entry.keywords();
    for (let i = 0; i < keywords.length; ++i) {
        const keyword = keywords[i];
        this._prefixSearchTree.insert(keyword, entry);
        this._suffixSearchTree.insert(reverseString(keyword), entry);
    }
    return entry;
};

TrackSearchIndex.prototype._removeFromSearchTree = function(entry) {
    const keywords = entry.keywords();
    for (let i = 0; i < keywords.length; ++i) {
        const keyword = keywords[i];
        this._prefixSearchTree.remove(keyword, entry);
        this._suffixSearchTree.remove(reverseString(keyword), entry);
    }
};

TrackSearchIndex.prototype.remove = function(transientId) {
    const entry = this._transientIdToEntry[transientId];
    if (!entry) return;
    this._removeFromSearchTree(entry);
    delete this._transientIdToEntry[transientId];
};
