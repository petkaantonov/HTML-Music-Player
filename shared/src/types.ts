import * as io from "io-ts";

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
