import AbstractBackend from "AbstractBackend";
import {getFirstWord, getLastWord, reverseString, normalizeQuery} from "util";
import {trackSearchIndexCmp, stopWords} from "tracks/TagDatabase";
import {merge, insert} from "search/sortedArrays";
import {indexedDB} from "platform/platform";

const {cmp: iDBCmp} = indexedDB;
const MAX_SEARCH_RESULTS = 2500;
const EMPTY_ARRAY = Object.freeze([]);

export const SEARCH_READY_EVENT_NAME = `searchReady`;

function getSearchTerm(trackInfo) {
    const title = normalizeQuery(trackInfo.title || ``);
    let artist = normalizeQuery(trackInfo.artist || ``);
    const album = normalizeQuery(trackInfo.album || ``);
    const genres = normalizeQuery((trackInfo.genres || EMPTY_ARRAY).join(` `));
    const albumArtist = normalizeQuery(trackInfo.albumArtist || ``);

    if (albumArtist.length > 0 &&
        artist.length > 0 &&
        albumArtist !== artist) {
        artist += ` ${albumArtist}`;
    }

    return ((title.split(` `).concat(artist.split(` `), album.split(` `), genres.split(` `))).join(` `)).trim();
}

export function getKeywords(searchTerm) {
    return Array.from(new Set(searchTerm.split(` `))).filter(keyword => !stopWords.has(keyword) && keyword.length > 1);
}

export function trackSearchIndexResultCmp(a, b) {
    const cmp = a.distance - b.distance;
    if (cmp === 0) {
        return iDBCmp(a.trackUid, b.trackUid);
    }
    return cmp;
}

class SearchResultRater {
    constructor(normalizedQuery) {
        const matchers = getKeywords(normalizedQuery.split(` `));
        normalizedQuery = matchers.join(` `);
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

function buildEntry(trackInfo) {
    const keywords = getKeywords(getSearchTerm(trackInfo));
    if (!keywords.length) {
        return null;
    }
    const searchTerm = keywords.join(` `);
    const {trackUid} = trackInfo;
    return {
        keywords,
        keywordsReversed: keywords.map(reverseString),
        trackUid,
        searchTerm
    };
}

export default class SearchBackend extends AbstractBackend {
    constructor(tagDatabase) {
        super(SEARCH_READY_EVENT_NAME);

        this._tagDatabase = tagDatabase;

        this.actions = {
            async search({sessionId, normalizedQuery}) {
                const results = await this._search(normalizedQuery);
                this.postMessage({
                    searchSessionId: sessionId,
                    type: `searchResults`,
                    results
                });
            }
        };
    }

    async addTrackToSearchIndexIfNotPresent(trackInfo) {
        const entry = buildEntry(trackInfo);
        if (!entry) return;
        await this._tagDatabase.addSearchIndexEntryForTrackIfNotPresent(entry);
    }

    async updateTrackToSearchIndex(trackInfo) {
        const entry = buildEntry(trackInfo);
        if (!entry) return;
        await this._tagDatabase.updateSearchIndexEntryForTrack(entry);
    }

    async _search(normalizedQuery) {
        const suffixQuery = reverseString(normalizedQuery);

        const firstPrefixKeyword = getFirstWord(normalizedQuery);
        const firstSuffixKeyword = getLastWord(suffixQuery);

        const [prefixMatches, suffixMatches] = await Promise.all([
            this._tagDatabase.searchPrefixes(firstPrefixKeyword),
            this._tagDatabase.searchSuffixes(firstSuffixKeyword)
        ]);

        const results = prefixMatches;
        merge(trackSearchIndexCmp, results, suffixMatches);
        const ret = new Array(Math.max(0, results.length >> 1));

        if (results.length > 0) {
            const rater = new SearchResultRater(normalizedQuery);
            ret.length = 0;

            const length = Math.min(results.length, MAX_SEARCH_RESULTS);

            for (let i = 0; i < length; ++i) {
                const result = results[i];
                const distance = rater.getDistanceForSearchTerm(result.searchTerm);
                if (!isFinite(distance)) {
                    continue;
                }

                const {trackUid} = result;
                insert(trackSearchIndexResultCmp, ret, {trackUid, distance});
            }
        }

        return ret;
    }
}
