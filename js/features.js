var features = features || {};

(function() {
    var input = document.createElement("input");

    var allowMimes = [];
    var allowExtensions = [];

    var featureMap = {
        "aac": "audio/aac",
        "mp1,mp2,mp3,mpg,mpeg": "audio/mp3",
        "mp4,m4a": "audio/mp4",
        "wav": "audio/wav",
        "ogg,oga": "audio/ogg",
        "opus": "audio/opus",
        "webm": "audio/webm"
    };

    features.readFiles = typeof FileReader == "function" && new FileReader()
        .readAsBinaryString;
    features.directories = ("webkitdirectory" in input ||
        "directory" in input ||
        "mozdirectory" in input);
    features.allowMimes = allowMimes;
    features.allowExtensions = allowExtensions;
    features.touch = ('ontouchstart' in window) ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0;

    var canPlay = (function() {
        var audio = document.createElement("audio");
        return function(mime) {
            return !!(audio.canPlayType(mime).replace(/no/gi, ""));
        };
    })();

    Object.keys(featureMap).forEach(function(extensionString) {
        var mime = featureMap[extensionString];
        var extensions = extensionString.split(",");
        if (canPlay(mime)) {
            allowExtensions.push.apply(allowExtensions, extensions);
            allowMimes.push(mime);
        }
    });

    if (!features.touch) {
        $("body").addClass("no-touch");
    }
})();
