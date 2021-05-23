import fastify, { FastifyReply, FastifyRequest } from "fastify";
import * as io from "io-ts";
import fetch from "node-fetch";
import { CorsUrl, CspReport } from "shared/src/types";
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
