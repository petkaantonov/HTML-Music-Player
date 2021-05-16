import * as io from "io-ts";

export const CONSTRAINT_ERROR = `ConstraintError`;
export const QUOTA_EXCEEDED_ERROR = `QuotaExceededError`;
export const UNKNOWN_ERROR = `UnknownError`;
export const INVALID_ACCESS_ERROR = `InvalidAccessError`;
export const INVALID_STATE_ERROR = `InvalidStateError`;
export const NOT_FOUND_ERROR = `NotFoundError`;
export const VERSION_ERROR = `VersionError`;
export const DATABASE_CLOSED_ERROR = `DatabaseClosedError`;
export const PATH_EXISTS_ERROR = `PathExistsError`;
export const INVALID_MODIFICATION_ERROR = `InvalidModificationError`;

export function isOutOfMemoryError(e: Error) {
    return e.name === UNKNOWN_ERROR || e.name === QUOTA_EXCEEDED_ERROR;
}

export class DatabaseClosedError extends Error {
    constructor() {
        super(`Database has been closed`);
        this.name = DATABASE_CLOSED_ERROR;
    }
}

export const ERROR_YOUTUBE_ERROR = 1;

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

export const AcoustIdErrorCode = io.union([
    io.literal(ERROR_INVALID_RESPONSE_SYNTAX),
    io.literal(ERROR_UNKNOWN_FORMAT),
    io.literal(ERROR_MISSING_PARAMETER),
    io.literal(ERROR_INVALID_FINGERPRINT),
    io.literal(ERROR_INVALID_APIKEY),
    io.literal(ERROR_INTERNAL),
    io.literal(ERROR_INVALID_USER_APIKEY),
    io.literal(ERROR_INVALID_UUID),
    io.literal(ERROR_INVALID_DURATION),
    io.literal(ERROR_INVALID_BITRATE),
    io.literal(ERROR_INVALID_FOREIGNID),
    io.literal(ERROR_INVALID_MAX_DURATION_DIFF),
    io.literal(ERROR_NOT_ALLOWED),
    io.literal(ERROR_SERVICE_UNAVAILABLE),
    io.literal(ERROR_TOO_MANY_REQUESTS),
    io.literal(ERROR_INVALID_MUSICBRAINZ_ACCESS_TOKEN),
    io.literal(ERROR_INSECURE_REQUEST),
    io.literal(ERROR_TIMEOUT),
]);
export type AcoustIdErrorCode = io.TypeOf<typeof AcoustIdErrorCode>;

export class AcoustIdApiError extends Error {
    code: number;
    constructor(message: string, code: AcoustIdErrorCode) {
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

export class FileReferenceDeletedError extends Error {
    constructor() {
        super(`file reference has been deleted`);
    }
}

export class HttpStatusError extends Error {
    status: number;
    responseText: string;
    constructor(status: number, responseText: string) {
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

export class NumberTypeError extends TypeError {
    constructor(name: string, value: number) {
        super(`${name} must be a number but it was ${typeof value}(${{}.toString.call(value)})`);
    }
}

export class NumberRangeTypeError extends TypeError {
    constructor(name: string, value: number, min: number, max: number) {
        super(`${name} (=${value}) is not in range [${min}, ${max}]`);
    }
}

export class NumberNotDivisibleTypeError extends TypeError {
    constructor(name: string, value: number, divisor: number) {
        super(`${name} (=${value}) is not divisible by ${divisor}`);
    }
}

export class NumberNonFiniteTypeError extends TypeError {
    constructor(name: string, value: number) {
        super(`${name} (=${value}) is not finite`);
    }
}

export class NumberNotIntegerTypeError extends TypeError {
    constructor(name: string, value: number) {
        super(`${name} (=${value}) is not a integer`);
    }
}

export function checkInteger(name: string, value: number) {
    checkNumber(name, value);
    if (Math.round(value) !== value) {
        throw new NumberNotIntegerTypeError(name, value);
    }
}

export function checkFiniteNumber(name: string, value: number) {
    checkNumber(name, value);
    if (!isFinite(value)) {
        throw new NumberNonFiniteTypeError(name, value);
    }
}

export function checkNumber(name: string, value: number) {
    if (typeof value !== `number`) {
        throw new NumberTypeError(name, value);
    }
}

export function checkNumberRange(name: string, value: number, min: number, max: number) {
    checkFiniteNumber(name, value);
    if (!(min <= value && value <= max)) {
        throw new NumberRangeTypeError(name, value, min, max);
    }
}

export function checkNumberDivisible(name: string, value: number, divisor: number, integerMultiplier = 1e9) {
    checkFiniteNumber(name, value);

    const iValue = Math.round(value * integerMultiplier);
    const iDivisor = Math.round(divisor * integerMultiplier);

    if (iValue % iDivisor !== 0) {
        throw new NumberNotDivisibleTypeError(name, value, divisor);
    }
}

export default class BooleanTypeError extends TypeError {
    constructor(name: string, value: any) {
        super(`${name} must be a boolean but it was ${typeof value}(${{}.toString.call(value)})`);
    }
}

export function checkBoolean(name: string, value: any) {
    if (typeof value !== `boolean`) {
        throw new BooleanTypeError(name, value);
    }
}

export const { MEDIA_ERR_ABORTED, MEDIA_ERR_NETWORK, MEDIA_ERR_DECODE, MEDIA_ERR_SRC_NOT_SUPPORTED } = MediaError;

export class AudioError extends Error {
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

export class TrackWasRemovedError extends Error {}
