import express from "express";
import * as io from "io-ts";
import morgan from "morgan";
import fetch from "node-fetch";
import { decode } from "shared/src/types/helpers";
import { pipeline } from "stream/promises";

const app = express();

const port = decode(io.number, process.env.SERVER_PORT || 8137);

interface CorsUrlBrand {
    readonly CorsUrl: unique symbol;
}

const corsUrls = ["https://api.acoustId.org/v2/lookup", "https://coverartarchive.org/", "https://coverartpics"];

const CorsUrl = io.brand(
    io.string,
    (s: string): s is io.Branded<string, CorsUrlBrand> => corsUrls.some(cu => s.startsWith(cu)),
    "CorsUrl"
);
type CorsUrl = io.TypeOf<typeof CorsUrl>;
app.use(morgan("combined"));
app.get("/cors", async (req, res) => {
    const url = decode(CorsUrl, req.query.url);
    const foreignResponse = await fetch(url, {
        headers: {
            accept: req.headers.accept || "application/json",
            origin: req.headers.origin || "localhost",
        },
        timeout: 15000,
    });
    if (!foreignResponse.ok) {
        res.writeHead(500, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        });
        const body = await foreignResponse.text();
        res.send({
            status: "error",
            error: {
                code: foreignResponse.status,
                body,
                message: "HTTP Error response from server: " + foreignResponse.statusText,
            },
        });
    } else {
        const headers: Record<string, string | undefined> = {
            ...foreignResponse.headers,
            "Access-Control-Allow-Origin": "*",
            Connection: "Keep-Alive",
        };
        headers["set-cookie"] = undefined;
        headers["set-cookie2"] = undefined;
        res.writeHead(foreignResponse.status, headers);
        await pipeline(foreignResponse.body, res);
    }
});

app.listen(port);
