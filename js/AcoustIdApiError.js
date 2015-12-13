AcoustIdApiError = util.subClassError("AcoustIdApiError", function(message, code) {
    this.code = code;
    this.message = message;
});
