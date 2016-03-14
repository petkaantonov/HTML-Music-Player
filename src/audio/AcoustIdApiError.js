"use strict";

import { subClassError } from "lib/util";

const codeToString = function(code) {
    return Object.keys(AcoustIdApiError).filter(function(key) {
        var value = AcoustIdApiError[key];
        return typeof value === "number" && code === value;
    })[0] || "ERROR_UNKNOWN";
};

export default var AcoustIdApiError = subClassError("AcoustIdApiError", function(message, code) {
    this.code = code;
    this.message = message || codeToString(code);
});

AcoustIdApiError.ERROR_INVALID_RESPONSE_SYNTAX = -1;
AcoustIdApiError.ERROR_UNKNOWN_FORMAT = 1;
AcoustIdApiError.ERROR_MISSING_PARAMETER = 2;
AcoustIdApiError.ERROR_INVALID_FINGERPRINT = 3;
AcoustIdApiError.ERROR_INVALID_APIKEY = 4;
AcoustIdApiError.ERROR_INTERNAL = 5;
AcoustIdApiError.ERROR_INVALID_USER_APIKEY = 6;
AcoustIdApiError.ERROR_INVALID_UUID = 7;
AcoustIdApiError.ERROR_INVALID_DURATION = 8;
AcoustIdApiError.ERROR_INVALID_BITRATE = 9;
AcoustIdApiError.ERROR_INVALID_FOREIGNID = 10;
AcoustIdApiError.ERROR_INVALID_MAX_DURATION_DIFF = 11;
AcoustIdApiError.ERROR_NOT_ALLOWED = 12;
AcoustIdApiError.ERROR_SERVICE_UNAVAILABLE = 13;
AcoustIdApiError.ERROR_TOO_MANY_REQUESTS = 14;
AcoustIdApiError.ERROR_INVALID_MUSICBRAINZ_ACCESS_TOKEN = 15;
AcoustIdApiError.ERROR_INSECURE_REQUEST = 14;

AcoustIdApiError.prototype.isFatal = function() {
    switch (this.code) {
        case AcoustIdApiError.ERROR_INVALID_RESPONSE_SYNTAX:
        case AcoustIdApiError.ERROR_UNKNOWN_FORMAT:
        case AcoustIdApiError.ERROR_MISSING_PARAMETER:
        case AcoustIdApiError.ERROR_INVALID_FINGERPRINT:
        case AcoustIdApiError.ERROR_INVALID_APIKEY:
        case AcoustIdApiError.ERROR_INVALID_USER_APIKEY:
        case AcoustIdApiError.ERROR_INVALID_UUID:
        case AcoustIdApiError.ERROR_INVALID_DURATION:
        case AcoustIdApiError.ERROR_INVALID_BITRATE:
        case AcoustIdApiError.ERROR_INVALID_FOREIGNID:
        case AcoustIdApiError.ERROR_INVALID_MAX_DURATION_DIFF:
        case AcoustIdApiError.ERROR_INVALID_MUSICBRAINZ_ACCESS_TOKEN:
        case AcoustIdApiError.ERROR_INSECURE_REQUEST:
            return true;
        default:
            return false;
    }
};

AcoustIdApiError.prototype.isRetryable = function() {
    return !this.isFatal();
};
