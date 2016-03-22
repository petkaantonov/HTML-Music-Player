"use strict";

export default function SearchResultRater(normalizedQuery) {
    var matchers = normalizedQuery.split(" ");
    for (var i = 0; i < matchers.length; ++i) {
        matchers[i] = new RegExp("\\b" + matchers[i] + "|" + matchers[i] + "\\b", "g");
    }
    this.matchers = matchers;
    this.normalizedQuery = normalizedQuery;
}

SearchResultRater.prototype.getDistanceForSearchTerm = function(searchTerm) {
    var exactMatchIndex = searchTerm.indexOf(this.normalizedQuery);
    if (exactMatchIndex >= 0) {
        return -9999999 + exactMatchIndex;
    } else {
        var matchers = this.matchers;
        var ret = 0;
        for (var i = 0; i < matchers.length; ++i) {
            var matcher = matchers[i];
            var result = matcher.test(searchTerm);
            var distance = matcher.lastIndex;
            matcher.lastIndex = 0;
            if (!result) {
                return Infinity;
            }
            ret += distance;
        }
        return ret;
    }
};
