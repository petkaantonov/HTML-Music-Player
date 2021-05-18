import {
    downloadYtId,
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
    YtId,
    YtQuery,
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
        const callbackName = "cbname";
        const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&hl=fi&gl=fi&sugexp=ytpbte,eaqrw=1,eba=1,ttt=1,tbt=1&gs_rn=64&gs_ri=youtube&authuser=0&ds=yt&q=${encodeURIComponent(
            query.query
        )}&callback=${encodeURIComponent(callbackName)}`;
        const response = await fetch(url);
        const result = await response.text();
        const searchString = `${callbackName}([`;
        const index = result.indexOf(searchString);
        if (index >= 0) {
            const dataStart = index + searchString.length - 1;
            const dataEnd = result.indexOf("])", index) + 1;
            const [, suggestions] = JSON.parse(result.slice(dataStart, dataEnd));
            return decode(YtSearchResultSuggestions, { results: suggestions.map((s: any) => s[0]) });
        } else {
            app.log.error("youtube suggestions format changed");
            return decode(YtSearchResultSuggestions, { results: [] });
        }
    })
);

const searchCache = new LRU<string, YtSearchResultsResponse>({ max: 10000 });
app.get(
    "/search",
    f({ query: io.type({ query: YtQuery }) }, async ({ query }, _req, res) => {
        void res.header("Access-Control-Allow-Origin", "*");
        const cached = searchCache.get(query.query);
        if (cached) {
            return cached;
        }
        const encoded = encodeURIComponent(query.query).replace(/%20/g, "+");
        const url = `https://www.youtube.com/results?search_query=${encoded}`;
        const response = await fetch(url);
        const result = await response.text();
        const initialData = "var ytInitialData = {";
        const initialDataIndex = result.indexOf(initialData);
        if (initialDataIndex >= 0) {
            const dataStart = initialDataIndex + initialData.length - 1;
            const dataEnd = result.indexOf("};", initialDataIndex) + 1;
            const json = result.slice(dataStart, dataEnd);
            const videos = JSON.parse(json)
                .contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents.filter(
                    (v: any) => !!v.videoRenderer
                )
                .map((v: any) => v.videoRenderer);

            const ret = decode(YtSearchResultsResponse, {
                results: videos.map((video: any) => ({
                    id: video.videoId,
                    title: video.title.runs[0].text,
                    thumbnail: [video.thumbnail.thumbnails[0].url],
                })),
            });
            searchCache.set(query.query, ret);
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
