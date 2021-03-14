import DatabaseUsingBackend from "common/DatabaseUsingBackend";
import TagDatabase, { stopWords, trackSearchIndexCmp } from "metadata/TagDatabase";
import { insert, merge } from "search/sortedArrays";
import { getFirstWord, getLastWord, reverseString } from "src/util";
import { normalizeQuery } from "src/utils/searchUtil";

import { TrackInfo } from "../../src/metadata/MetadataManagerFrontend";
import { SearchBackendActions, SearchResult, SearchWorkerResult } from "../../src/search/SearchController";
import { AnyFunction } from "../../src/types/helpers";

const MAX_SEARCH_RESULTS = 2500;
const EMPTY_ARRAY = Object.freeze([]);

function getSearchTerm(trackInfo: TrackInfo) {
    const title = normalizeQuery(trackInfo.title || ``);
    let artist = normalizeQuery(trackInfo.artist || ``);
    const album = normalizeQuery(trackInfo.album || ``);
    const genres = normalizeQuery((trackInfo.genres || EMPTY_ARRAY).join(` `));
    const albumArtist = normalizeQuery(trackInfo.albumArtist || ``);

    if (albumArtist.length > 0 && artist.length > 0 && albumArtist !== artist) {
        artist += ` ${albumArtist}`;
    }

    return title.split(` `).concat(artist.split(` `), album.split(` `), genres.split(` `)).join(` `).trim();
}

export function getKeywords(searchTerm: string) {
    return Array.from(new Set(searchTerm.split(` `))).filter(keyword => !stopWords.has(keyword) && keyword.length > 1);
}

export function trackSearchIndexResultCmp(a: SearchResult, b: SearchResult) {
    const cmp = a.distance - b.distance;
    if (cmp === 0) {
        return indexedDB.cmp(a.trackUid, b.trackUid);
    }
    return cmp;
}

class SearchResultRater {
    normalizedQuery: string;
    matchers: RegExp[];
    constructor(normalizedQuery: string) {
        const stringMatchers = getKeywords(normalizedQuery);
        normalizedQuery = stringMatchers.join(` `);
        const regExpMatchers: RegExp[] = new Array(stringMatchers.length);
        for (let i = 0; i < stringMatchers.length; ++i) {
            regExpMatchers[i] = new RegExp(`\\b${stringMatchers[i]}|${stringMatchers[i]}\\b`, `g`);
        }
        this.matchers = regExpMatchers;
        this.normalizedQuery = normalizedQuery;
    }

    getDistanceForSearchTerm(searchTerm: string) {
        const exactMatchIndex = searchTerm.indexOf(this.normalizedQuery);
        if (exactMatchIndex >= 0) {
            return -9999999 + exactMatchIndex;
        } else {
            const { matchers } = this;
            let ret = 0;
            for (let i = 0; i < matchers.length; ++i) {
                const matcher = matchers[i]!;
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

function buildEntry(trackInfo: TrackInfo) {
    const keywords = getKeywords(getSearchTerm(trackInfo));
    if (!keywords.length) {
        return null;
    }
    const searchTerm = keywords.join(` `);
    const { trackUid } = trackInfo;
    return {
        keywords,
        keywordsReversed: keywords.map(reverseString),
        trackUid,
        searchTerm,
    };
}

export default class SearchBackend extends DatabaseUsingBackend<SearchBackendActions<SearchBackend>, "search"> {
    constructor(database: TagDatabase) {
        super("search", database, {
            async search({ sessionId, normalizedQuery }) {
                if (!this.canUseDatabase()) return;
                const results = await this._search(normalizedQuery);
                this.postMessageToSearchFrontend({
                    searchSessionId: sessionId,
                    type: `searchResults`,
                    results,
                });
            },
        });
    }

    async addTrackToSearchIndexIfNotPresent(trackInfo: TrackInfo) {
        if (!this.canUseDatabase()) return;
        const entry = buildEntry(trackInfo);
        if (!entry) return;
        await this.database.addSearchIndexEntryForTrackIfNotPresent(entry);
    }

    async updateTrackToSearchIndex(trackInfo: TrackInfo) {
        if (!this.canUseDatabase()) return;
        const entry = buildEntry(trackInfo);
        if (!entry) return;
        await this.database.updateSearchIndexEntryForTrack(entry);
    }

    async _search(normalizedQuery: string) {
        const suffixQuery = reverseString(normalizedQuery);

        const firstPrefixKeyword = getFirstWord(normalizedQuery);
        const firstSuffixKeyword = getLastWord(suffixQuery);

        const [prefixMatches, suffixMatches] = await Promise.all([
            this.database.searchPrefixes(firstPrefixKeyword),
            this.database.searchSuffixes(firstSuffixKeyword),
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

                const { trackUid } = result;
                insert(trackSearchIndexResultCmp, ret, { trackUid, distance });
            }
        }

        return ret;
    }

    postMessageToSearchFrontend(result: SearchWorkerResult) {
        this.postMessageToFrontend([result]);
    }
}
