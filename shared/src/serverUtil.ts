const rAuthHeader = /Basic ([a-zA-Z0-9=_\-+]+)/;

export interface Auth {
    username: string;
    password: string;
}

export function parseAuthHeader(headerValue: string): Auth {
    const a = rAuthHeader.exec(`${headerValue}`);
    if (!a) {
        throw new InvalidAuthError("invalid authorzation header");
    }
    const [username, password] = Buffer.from(a[1], "base64").toString("utf-8").split(":", 1);
    return {
        username,
        password,
    };
}

export class InvalidAuthError extends Error {}
