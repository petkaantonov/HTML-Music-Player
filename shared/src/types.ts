import * as io from "io-ts";

interface YtQueryBrand {
    readonly YtQuery: unique symbol;
}

export const YtQuery = io.brand(
    io.string,
    (s: string): s is io.Branded<string, YtQueryBrand> => s.length < 100,
    "YtQuery"
);
export type YtQuery = io.TypeOf<typeof YtQuery>;

interface YtIdBrand {
    readonly YtId: unique symbol;
}

const YtIdRe = /([A-Za-z0-9_-]{11})/;
export const YtId = io.brand(io.string, (s: string): s is io.Branded<string, YtIdBrand> => YtIdRe.test(s), "YtId");
export type YtId = io.TypeOf<typeof YtId>;

interface CorsUrlBrand {
    readonly CorsUrl: unique symbol;
}

const corsUrls = [
    "https://api.acoustId.org/v2/lookup",
    "https://coverartarchive.org/",
    "https://coverartpics",
    "http://coverartarchive.org",
];

export const CorsUrl = io.brand(
    io.string,
    (s: string): s is io.Branded<string, CorsUrlBrand> => corsUrls.some(cu => s.startsWith(cu)),
    "CorsUrl"
);
export type CorsUrl = io.TypeOf<typeof CorsUrl>;

export const CspReport = io.type({
    "csp-report": io.partial({
        "document-uri": io.string,
        referrer: io.string,
        "blocked-uri": io.string,
        "violated-directive": io.string,
        "original-policy": io.string,
    }),
});

export const YtVideoSearchResult = io.type({
    type: io.literal("track"),
    id: YtId,
    bitrate: io.number,
    extension: io.string,
    size: io.number,
    title: io.string,
    duration: io.number,
    thumbnail: io.union([io.string, io.null]),
});
export type YtVideoSearchResult = io.TypeOf<typeof YtVideoSearchResult>;
export const YtPlaylistSearchResult = io.type({
    type: io.literal("playlist"),
    id: io.string,
    title: io.string,
    thumbnail: io.union([io.string, io.null]),
    trackCount: io.number,
});
export type YtPlaylistSearchResult = io.TypeOf<typeof YtPlaylistSearchResult>;

export const YtSearchResult = io.union([YtVideoSearchResult, YtPlaylistSearchResult]);

export const YtSearchResultsResponse = io.intersection([
    io.type({
        results: io.array(YtSearchResult),
    }),
    io.partial({
        continuation: io.string,
    }),
]);

export type YtSearchResultsResponse = io.TypeOf<typeof YtSearchResultsResponse>;

export const YtSearchResultSuggestions = io.type({
    results: io.array(io.string),
});

export type YtSearchResultSuggestions = io.TypeOf<typeof YtSearchResultSuggestions>;

export const searchFiltersToYt = {
    playlists: "EgIQAw==",
    videos: "EgIQAQ==",
    "videos<4": "EgIYAQ==",
    "videos4-20": "EgIYAw==",
    "videos>20": "EgIYAg==",
};

export const YtSearchFilter = io.keyof(searchFiltersToYt);
export type YtSearchFilter = io.TypeOf<typeof YtSearchFilter>;

export const YtSearchQuery = io.intersection([
    io.type({
        query: YtQuery,
    }),
    io.partial({
        filter: YtSearchFilter,
        continuation: io.string,
    }),
]);

export type YtSearchQuery = io.TypeOf<typeof YtSearchQuery>;
