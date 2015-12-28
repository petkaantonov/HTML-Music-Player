"use strict";
const util = require("./util");

var AudioError = util.subClassError("AudioError", function(code) {
    this.code = code;
    var audioCodeString;
    switch (code) {
        case MediaError.MEDIA_ERR_ABORTED: audioCodeString = "MEDIA_ERR_ABORTED"; break;
        case MediaError.MEDIA_ERR_NETWORK: audioCodeString = "MEDIA_ERR_NETWORK"; break;
        case MediaError.MEDIA_ERR_DECODE: audioCodeString = "MEDIA_ERR_DECODE"; break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: audioCodeString = "MEDIA_ERR_SRC_NOT_SUPPORTED"; break;
        default: audioCodeString = "UNKNOWN_ERROR"; break;
    }

    this.message = "Cannot load audio: " + audioCodeString;
});
module.exports = AudioError;
