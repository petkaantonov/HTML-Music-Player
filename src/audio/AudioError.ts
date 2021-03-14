import { ExtendableError } from "../util";

export const { MEDIA_ERR_ABORTED, MEDIA_ERR_NETWORK, MEDIA_ERR_DECODE, MEDIA_ERR_SRC_NOT_SUPPORTED } = MediaError;

export default class AudioError extends ExtendableError {
    code: number;

    constructor(code: MediaError["code"]) {
        super(`Cannot load audio: ${code}`);
        this.code = code;
    }

    isAbortionError() {
        return this.code === MEDIA_ERR_ABORTED;
    }

    isNetworkError() {
        return this.code === MEDIA_ERR_NETWORK;
    }

    isDecodingError() {
        return this.code === MEDIA_ERR_DECODE || this.code === MEDIA_ERR_SRC_NOT_SUPPORTED;
    }

    isRetryable() {
        return this.isNetworkError();
    }
}
