import {ExtendableError} from "util";

export const ERROR_INVALID_RESPONSE_SYNTAX = -1;
export const ERROR_UNKNOWN_FORMAT = 1;
export const ERROR_MISSING_PARAMETER = 2;
export const ERROR_INVALID_FINGERPRINT = 3;
export const ERROR_INVALID_APIKEY = 4;
export const ERROR_INTERNAL = 5;
export const ERROR_INVALID_USER_APIKEY = 6;
export const ERROR_INVALID_UUID = 7;
export const ERROR_INVALID_DURATION = 8;
export const ERROR_INVALID_BITRATE = 9;
export const ERROR_INVALID_FOREIGNID = 10;
export const ERROR_INVALID_MAX_DURATION_DIFF = 11;
export const ERROR_NOT_ALLOWED = 12;
export const ERROR_SERVICE_UNAVAILABLE = 13;
export const ERROR_TOO_MANY_REQUESTS = 14;
export const ERROR_INVALID_MUSICBRAINZ_ACCESS_TOKEN = 15;
export const ERROR_INSECURE_REQUEST = 14;
export const ERROR_TIMEOUT = 15;

export default class AcoustIdApiError extends ExtendableError {
    constructor(message, code) {
        super(`AcoustId ApiError: ${message}`);
        this.code = code;
    }

    isFatal() {
        switch (this.code) {
            case ERROR_INVALID_RESPONSE_SYNTAX:
            case ERROR_UNKNOWN_FORMAT:
            case ERROR_MISSING_PARAMETER:
            case ERROR_INVALID_FINGERPRINT:
            case ERROR_INVALID_APIKEY:
            case ERROR_INVALID_USER_APIKEY:
            case ERROR_INVALID_UUID:
            case ERROR_INVALID_DURATION:
            case ERROR_INVALID_BITRATE:
            case ERROR_INVALID_FOREIGNID:
            case ERROR_INVALID_MAX_DURATION_DIFF:
            case ERROR_INVALID_MUSICBRAINZ_ACCESS_TOKEN:
            case ERROR_INSECURE_REQUEST:
                return true;
            default:
                return false;
        }
    }

    isRetryable() {
        return !this.isFatal();
    }

    isInvalidResponseSyntaxError() {
        return this.code === ERROR_INVALID_RESPONSE_SYNTAX;
    }
    isUnknownFormatError() {
        return this.code === ERROR_UNKNOWN_FORMAT;
    }
    isMissingParameterError() {
        return this.code === ERROR_MISSING_PARAMETER;
    }
    isInvalidFingerprintError() {
        return this.code === ERROR_INVALID_FINGERPRINT;
    }
    isInvalidApikeyError() {
        return this.code === ERROR_INVALID_APIKEY;
    }
    isInternalError() {
        return this.code === ERROR_INTERNAL;
    }
    isInvalidUserApikeyError() {
        return this.code === ERROR_INVALID_USER_APIKEY;
    }
    isInvalidUuidError() {
        return this.code === ERROR_INVALID_UUID;
    }
    isInvalidDurationError() {
        return this.code === ERROR_INVALID_DURATION;
    }
    isInvalidBitrateError() {
        return this.code === ERROR_INVALID_BITRATE;
    }
    isInvalidForeignidError() {
        return this.code === ERROR_INVALID_FOREIGNID;
    }
    isInvalidMaxDurationDiffError() {
        return this.code === ERROR_INVALID_MAX_DURATION_DIFF;
    }
    isNotAllowedError() {
        return this.code === ERROR_NOT_ALLOWED;
    }
    isServiceUnavailableError() {
        return this.code === ERROR_SERVICE_UNAVAILABLE;
    }
    isTooManyRequestsError() {
        return this.code === ERROR_TOO_MANY_REQUESTS;
    }
    isInvalidMusicbrainzAccessTokenError() {
        return this.code === ERROR_INVALID_MUSICBRAINZ_ACCESS_TOKEN;
    }
    isInsecureRequestError() {
        return this.code === ERROR_INSECURE_REQUEST;
    }
    isTimeoutError() {
        return this.code === ERROR_TIMEOUT;
    }
}




