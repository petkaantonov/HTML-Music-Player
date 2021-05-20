import {
    BITRATE,
    downloadYtId,
    EXTENSION,
    TooManyConcurrentDownloadsError,
    YoutubeNotAvailableError,
    YoutubeWrongCredentialsError,
} from "backend/ytdl";
import fastify, { FastifyReply, FastifyRequest } from "fastify";
import * as io from "io-ts";
import LRU from "lru-cache";
import { Readable } from "node:stream";
import fetch from "node-fetch";
import {
    CorsUrl,
    CspReport,
    searchFiltersToYt,
    YtId,
    YtQuery,
    YtSearchQuery,
    YtSearchResultsResponse,
    YtSearchResultSuggestions,
} from "shared/src/types";
import { decode } from "shared/src/types/helpers";
import sourceMapSupport from "source-map-support";

sourceMapSupport.install({
    environment: "node",
});

const app = fastify({
    logger: true,
    disableRequestLogging: true,
});

function toText(obj: any) {
    if (obj.simpleText) {
        return obj.simpleText;
    } else if (obj.runs) {
        return obj.runs.map((run: any) => run.text).join("");
    } else {
        return obj.toString();
    }
}

function parseLength(len: string): number {
    const spl = len.split(".");
    let mul;
    switch (spl.length) {
        case 3:
            mul = 3600;
            break;
        case 2:
            mul = 60;
            break;
        case 1:
            mul = 1;
            break;
        default:
            return 0;
    }
    let seconds = 0;
    while (spl.length > 0) {
        const item = parseFloat(spl.shift()!);
        if (isNaN(item)) {
            return 0;
        }
        seconds += item * mul;
        mul /= 60;
    }
    return seconds;
}

function f<ParamsT, BodyT, QueryParamsT>(
    types: Partial<{
        params: io.Type<ParamsT, any>;
        query: io.Type<QueryParamsT, any>;
        body: io.Type<BodyT, any>;
    }>,
    handler: (
        data: {
            params: ParamsT;
            body: BodyT;
            query: QueryParamsT;
        },
        req: FastifyRequest,
        res: FastifyReply
    ) => Promise<any>
) {
    return async function (req: FastifyRequest, res: FastifyReply) {
        const result = await handler(
            {
                params: types.params ? decode(types.params, req.params) : (undefined as any),
                body: types.body ? decode(types.body, req.body) : (undefined as any),
                query: types.query ? decode(types.query, req.query) : (undefined as any),
            },
            req,
            res
        );
        if (result) {
            await res.status(result.statusCode ?? 200).send(result);
        }
    };
}

const userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36";
const port = decode(io.number, parseInt(process.env.SERVER_PORT || "8137", 10));

app.addContentTypeParser("text/json", { parseAs: "string" }, app.getDefaultJsonParser("ignore", "ignore"));
app.addContentTypeParser("application/csp-report", { parseAs: "string" }, app.getDefaultJsonParser("ignore", "ignore"));

app.post(
    "/csp-reports",
    f({ body: CspReport }, async ({ body }) => {
        app.log.error(`error: csp violation ${JSON.stringify(body)}`);
        return { status: "ok" };
    })
);

app.get(
    "/cors",
    f({ query: io.type({ url: CorsUrl }) }, async ({ query }, req, res) => {
        const url = query.url;
        const foreignResponse = await fetch(url, {
            headers: {
                accept: req.headers.accept || "application/json",
                origin: req.headers.origin || "localhost",
                "User-Agent": userAgent,
            },
        });
        if (!foreignResponse.ok) {
            const body = await foreignResponse.text();
            let jsonBody;
            try {
                jsonBody = JSON.parse(body);
                // eslint-disable-next-line no-empty
            } catch (e) {}
            // eslint-disable-next-line no-console
            console.error(
                "error when cors requesting",
                url,
                foreignResponse.status,
                jsonBody ? JSON.stringify(jsonBody) : body
            );
            await res.status(foreignResponse.status).send({
                status: "error",
                error: {
                    code: foreignResponse.status,
                    body: jsonBody ? jsonBody : body,
                    message: "HTTP Error response from server: " + foreignResponse.statusText,
                },
            });
        } else {
            const headers: Record<string, string | undefined> = {
                ...foreignResponse.headers,
            };
            headers["set-cookie"] = undefined;
            headers["set-cookie2"] = undefined;
            await res.headers(headers).status(foreignResponse.status).send(foreignResponse.body);
        }
    })
);

app.get(
    "/search/suggestions",
    f({ query: io.type({ query: YtQuery }) }, async ({ query }, _req, res) => {
        void res.header("Access-Control-Allow-Origin", "*");
        const body = JSON.stringify({
            context: {
                client: {
                    clientName: "WEB_REMIX",
                    clientVersion: "0.1",
                    newVisitorCookie: true,
                },
                user: {
                    lockedSafetyMode: false,
                },
            },
            input: query.query,
        });
        const url =
            "https://music.youtube.com/youtubei/v1/music/get_search_suggestions?alt=json&key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
        const response = await fetch(url, {
            headers: {
                "User-Agent": userAgent,
                "Content-Type": "application/json",
                Referer: "https://music.youtube.com/",
                Origin: "https://music.youtube.com",
                "x-origin": "https://music.youtube.com",
            },
            body,
            method: "POST",
        });
        try {
            const json = (await response.json()) as any;
            return decode(YtSearchResultSuggestions, {
                results: json.contents[0].searchSuggestionsSectionRenderer.contents.map((v: any) =>
                    toText(v.searchSuggestionRenderer.suggestion)
                ),
            });
        } catch (e) {
            app.log.error("youtube suggestions format changed");
            return decode(YtSearchResultSuggestions, { results: [] });
        }
    })
);

const playlistCache = new LRU<string, YtSearchResultsResponse>({ max: 100 });
app.get(
    "/search/playlist/:playlistId",
    f({ params: io.type({ playlistId: io.string }) }, async ({ params }, _req, res) => {
        void res.header("Access-Control-Allow-Origin", "*");
        const cached = playlistCache.get(params.playlistId);
        if (cached) {
            return cached;
        }
        const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(params.playlistId)}`;
        const response = await fetch(url, {
            headers: {
                "User-Agent": userAgent,
            },
        });
        const result = await response.text();
        const initialData = "var ytInitialData = {";
        const initialDataIndex = result.indexOf(initialData);
        let ret: YtSearchResultsResponse = { results: [] };
        if (initialDataIndex >= 0) {
            const dataStart = initialDataIndex + initialData.length - 1;
            const dataEnd = result.indexOf("};", initialDataIndex) + 1;
            const json = result.slice(dataStart, dataEnd);
            try {
                const videos = JSON.parse(
                    json
                ).contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].playlistVideoListRenderer.contents.filter(
                    (v: any) => !!v.playlistVideoRenderer
                );

                ret = decode(YtSearchResultsResponse, {
                    results: videos.map((video: any) => ({
                        type: "track",
                        extension: EXTENSION,
                        bitrate: BITRATE,
                        id: video.playlistVideoRenderer.videoId,
                        duration: parseFloat(video.playlistVideoRenderer.lengthSeconds),
                        title: toText(video.playlistVideoRenderer.title),
                        thumbnail: video.playlistVideoRenderer.thumbnail.thumbnails[0]?.url || null,
                    })),
                });
                playlistCache.set(params.playlistId, ret);
            } catch (e) {
                app.log.error("cannot parse json from " + json);
                app.log.error(e.message);
            }
        } else {
            app.log.error("playlist format changed");
        }
        return ret;
    })
);

const searchCache = new LRU<string, YtSearchResultsResponse>({ max: 10000 });
app.get(
    "/search",
    f({ query: YtSearchQuery }, async ({ query }, _req, res) => {
        void res.header("Access-Control-Allow-Origin", "*");
        const cacheKey = `${query.query}|${query.filter}`;
        if (!query.continuation) {
            const cached = searchCache.get(cacheKey);
            if (cached) {
                return cached;
            }
        }
        const search_query = encodeURIComponent(query.query).replace(/%20/g, "+");
        const sp = query.filter ? `&sp=${encodeURIComponent(searchFiltersToYt[query.filter])}` : "";
        const url = `https://www.youtube.com/results?search_query=${search_query}${sp}`;
        const response = await fetch(url, {
            headers: {
                "User-Agent": userAgent,
            },
        });
        const result = await response.text();
        const initialData = "var ytInitialData = {";
        const initialDataIndex = result.indexOf(initialData);
        if (initialDataIndex >= 0) {
            const dataStart = initialDataIndex + initialData.length - 1;
            const dataEnd = result.indexOf("};", initialDataIndex) + 1;
            const json = result.slice(dataStart, dataEnd);
            let ret: YtSearchResultsResponse | void;
            try {
                const parsedJson = JSON.parse(json);
                const videos = parsedJson.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents.filter(
                    (v: any) => !!v.videoRenderer || !!v.playlistRenderer
                );

                ret = decode(YtSearchResultsResponse, {
                    results: videos.map((video: any) =>
                        video.videoRenderer
                            ? {
                                  type: "track",
                                  extension: EXTENSION,
                                  bitrate: BITRATE,
                                  duration: parseLength(toText(video.videoRenderer.lengthText)),
                                  id: video.videoRenderer.videoId,
                                  title: toText(video.videoRenderer.title),
                                  thumbnail: video.videoRenderer.thumbnail.thumbnails[0]?.url || null,
                              }
                            : {
                                  type: "playlist",
                                  id: video.playlistRenderer.playlistId,
                                  title: toText(video.playlistRenderer.title),
                                  trackCount: parseFloat(video.playlistRenderer.videoCount),
                                  thumbnail: video.playlistRenderer.thumbnails[0]?.thumbnails[0]?.url || null,
                              }
                    ),
                });
                if (!query.continuation) {
                    searchCache.set(cacheKey, ret);
                }
            } catch (e) {
                ret = { results: [] };
                app.log.error("cannot parse json from " + json);
                app.log.error(e.message);
            }
            return ret;
        } else {
            app.log.error("youtube search results format changed");
            return decode(YtSearchResultsResponse, { results: [] });
        }
    })
);

app.get(
    "/download/:ytid",
    f({ params: io.type({ ytid: YtId }) }, async ({ params }, req, res) => {
        void res.header("Access-Control-Allow-Origin", "*");
        try {
            let aborted = false;

            const download = downloadYtId(params.ytid, app.log);
            req.raw.on("close", () => {
                if (!aborted) {
                    aborted = true;
                    // eslint-disable-next-line @typescript-eslint/no-empty-function
                    void download.abort(new Error("client closed connection")).catch(() => {});
                }
            });
            const fileName = download.fileName();
            const fileType = download.fileType();
            let stream: Readable | undefined;
            try {
                stream = await download.start();
            } catch (e) {
                if (e instanceof YoutubeNotAvailableError) {
                    return {
                        statusCode: 404,
                        status: "error",
                        error: {
                            code: 404,
                            message: e.message,
                        },
                    };
                } else if (e instanceof YoutubeWrongCredentialsError) {
                    return {
                        statusCode: 401,
                        status: "error",
                        error: {
                            code: 401,
                            message: e.message,
                        },
                    };
                } else {
                    throw e;
                }
            }
            await res.header("Content-Disposition", `inline; filename="${fileName}"`).type(fileType).send(stream);
            return undefined;
        } catch (e) {
            if (e instanceof TooManyConcurrentDownloadsError) {
                return {
                    statusCode: 429,
                    status: "error",
                    error: {
                        code: 429,
                        message: "Too many concurrent downloads, try again later",
                    },
                };
            }
            throw e;
        }
    })
);

app.setErrorHandler(async function (error: Error, request: FastifyRequest, res: FastifyReply) {
    app.log.error(
        `error when requesting ${request.url}: ${error.stack ? error.stack : error.name + " " + error.message}`
    );
    await res.status(500).send({
        status: "error",
        error: {
            code: 500,
            message: "Something went wrong",
        },
    });
});

app.setNotFoundHandler(async function (request: FastifyRequest, res: FastifyReply) {
    app.log.error(`error when requesting ${request.url}: 404 not found`);
    await res.status(404).send({
        status: "error",
        error: {
            code: 404,
            message: "Not found",
        },
    });
});

void (async () => {
    app.log.info(`Starting server revision ${process.env.REVISION} port ${port}`);
    try {
        await app.listen(port);
        app.log.info(`Server started revision ${process.env.REVISION} port ${port}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
})();
