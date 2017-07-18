export default class SearchResultRater {
    constructor(normalizedQuery) {
        const matchers = normalizedQuery.split(` `);
        for (let i = 0; i < matchers.length; ++i) {
            matchers[i] = new RegExp(`\\b${matchers[i]}|${matchers[i]}\\b`, `g`);
        }
        this.matchers = matchers;
        this.normalizedQuery = normalizedQuery;
    }

    getDistanceForSearchTerm(searchTerm) {
        const exactMatchIndex = searchTerm.indexOf(this.normalizedQuery);
        if (exactMatchIndex >= 0) {
            return -9999999 + exactMatchIndex;
        } else {
            const {matchers} = this;
            let ret = 0;
            for (let i = 0; i < matchers.length; ++i) {
                const matcher = matchers[i];
                const result = matcher.test(searchTerm);
                const distance = matcher.lastIndex;
                matcher.lastIndex = 0;
                if (!result) {
                    return Infinity;
                }
                ret += distance;
            }
            return ret;
        }
    }
}
