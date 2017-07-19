export default class HttpStatusError extends Error {
    constructor(status, responseText) {
        super(`HTTP ${status}: ${responseText}`);
        this.status = status;
        this.responseText = responseText;
    }

    json() {
        try {
            return JSON.parse(this.responseText);
        } catch (e) {
            return null;
        }
    }

    isTimeoutError() {
        return this.status === 408;
    }
}
