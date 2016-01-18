"use strict";
const $ = require("../lib/jquery");

const PlayerPictureManager = require("./PlayerPictureManager");
const EventEmitter = require("events");
const util = require("./util");
const TagData = require("./TagData");
const Tooltip = require("./Tooltip");
const sha1 = require("../lib/sha1");
const Promise = require("../lib/bluebird");

const ANALYSIS_TOOLTIP_MESSAGE =
"<p>This track is currently being analyzed for loudness normalization, silence removal, clipping protection and fingerprinting.</p>" +
"<p>Playing this track before the analysis has been completed may require manually adjusting volume.</p>";

const ERROR_HEADER = "<p>There was an error with this track:</p>";

Track.DECODE_ERROR = "<p>The file could not be decoded. Check that the codec is supported and the file is not corrupted.</p>";
Track.FILESYSTEM_ACCESS_ERROR = "<p>Access to the file was denied. It has probably been moved or altered after being added to the playlist.</p>";
Track.UNKNOWN_ERROR = "<p>Unknown error</p>";

const NULL = $(null);

function Track(audioFile) {
    EventEmitter.call(this);
    this.file = audioFile;
    this.tagData = null;
    this.index = -1;
    this._error = null;
    this._domNode = NULL;
    this._searchString = null;
    this._isAttached = false;
    this._lastPlayed = 0;

    this._generatedImage = null;

    this._errorTooltip = null;
    // Todo extract to a class.
    this._analysisTooltip = null;
    this._isBeingAnalyzed = false;
    this._analysisCompletionEstimate = -1;
}
util.inherits(Track, EventEmitter);

Track.prototype._ensureDomNode = function() {
    if (this._domNode !== NULL) return;
    var selectable = playlist.main.getSelectable();
    var self = this;
    this._domNode = $("<div>", {
        class: "track-container"
    }).html("<div class='track'>                                                                    \
        <div class='track-status'>                                                      \
            <span class='icon glyphicon glyphicon-volume-up playing-icon'></span>                   \
        </div>                                                                                      \
        <div class='track-number'></div>                                                            \
        <div class='track-info'>                                                                    \
            <div class='track-title notextflow'></div>                                              \
            <div class='track-artist notextflow'></div>                                             \
        </div>                                                                                      \
        <div class='track-duration'></div>                                                          \
        <div class='track-rating unclickable'>                                                      \
            <div data-rating='1' class='glyphicon glyphicon-star rating-input'></div>               \
            <div data-rating='2' class='glyphicon glyphicon-star rating-input'></div>               \
            <div data-rating='3' class='glyphicon glyphicon-star rating-input'></div>               \
            <div data-rating='4' class='glyphicon glyphicon-star rating-input'></div>               \
            <div data-rating='5' class='glyphicon glyphicon-star rating-input'></div>               \
        </div>                                                                                      \
    </div>");

    this.setTrackDuration();
    this.setTrackInfo();

    if (this.tagData) {
        this.setRatingStars();
    }

    if (selectable.contains(this)) {
        this.selected();
    }

    if (playlist.main.getCurrentTrack() === this) {
        this.startPlaying();
    }

    this.indexChanged();

    if (this._isBeingAnalyzed) {
        this.showAnalysisStatus();
        this.updateAnalysisEstimate();
    }

    if (this._error) {
        this.showErrorStatus();
    }
};

Track.prototype.getTrackInfo = function() {
    var artist, title;
    if (!this.tagData) {
        var artistAndTitle = TagData.trackInfoFromFileName(this.getFileName());
        artist = artistAndTitle.artist;
        title = artistAndTitle.title;
    } else {
        artist = this.tagData.getArtist();
        title = this.tagData.getTitle();
    }

    return {
        artist: artist,
        title: title
    };
};

Track.prototype.setTrackInfo = function() {
    var artistAndTitle = this.getTrackInfo();

    this.$().find(".track-title").text(artistAndTitle.title);
    this.$().find(".track-artist").text(artistAndTitle.artist);
};

Track.prototype.setTrackNumber = function() {
    this.$trackNumber().text((this.getIndex() + 1) + ".");
};

Track.prototype.setTrackDuration = function() {
    this.$trackDuration().text(this.formatTime());
};

Track.prototype.setRatingStars = function() {
    var ratingValue = this.getRating();
    this.$().find(".track-rating").addClass("visible");
    this.$ratingInputs().removeClass("rate-intent rated");

    if (ratingValue === -1) {
        this.$().find(".track-rating").removeClass("already-rated");
    } else {
        this.$().find(".track-rating").addClass("already-rated");
        this.$ratingInputsForRatingValue(ratingValue).addClass("rated");
    }
};

Track.prototype.$ = function() {
    return this._domNode;
};

Track.prototype.$container = function() {
    return this.$().find(".track");
};

Track.prototype.$trackStatus = function() {
    return this.$().find(".track-status");
};

Track.prototype.$trackNumber = function() {
    return this.$().find(".track-number");
};

Track.prototype.$trackDuration = function() {
    return this.$().find(".track-duration");
};

Track.prototype.$ratingInputs = function() {
    return this.$().find(".rating-input");
};

Track.prototype.$ratingInputsForRatingValue = function(value) {
    return this.$ratingInputs().filter(function() {
        return parseInt($(this).data("rating"), 10) <= value;
    });
};

Track.prototype.getTrackGain = function() {
    if (!this.tagData) return 0;
    return this.tagData.getTrackGain();
};

Track.prototype.getAlbumGain = function() {
    if (!this.tagData) return 0;
    return this.tagData.getAlbumGain();
};

Track.prototype.getTrackPeak = function() {
    if (!this.tagData) return 1;
    return this.tagData.getTrackPeak();
};

Track.prototype.getAlbumPeak = function() {
    if (!this.tagData) return 1;
    return this.tagData.getAlbumPeak();
};

Track.prototype.isVisible = function() {
    return this._isAttached;
};

Track.prototype.willBeReplaced = function() {
    if (this._generatedImage) {
        URL.revokeObjectURL(this._generatedImage.src);
        this._generatedImage = null;
    }
};

Track.prototype.remove = function() {
    this.index = -1;
    this._isAttached = false;

    if (this._analysisTooltip) {
        this._analysisTooltip.destroy();
        this._analysisTooltip = null;
    }

    if (this._errorTooltip) {
        this._errorTooltip.destroy();
        this._errorTooltip = null;
    }

    if (this.tagData) {
        this.tagData.destroy();
        this.tagData = null;
    }

    if (this._generatedImage) {
        URL.revokeObjectURL(this._generatedImage.src);
        this._generatedImage = null;
    }

    this.$().remove();
    this._domNode = NULL;
    this.emit("destroy", this);
    this.removeAllListeners();
};

Track.prototype.attach = function(target) {
    this._ensureDomNode();
    this._isAttached = true;
    this.$().appendTo(target);
};

Track.prototype.detach = function() {
    if (this._isAttached) {
        this.$().detach();
        this._isAttached = false;
        if (this._analysisTooltip) {
            this._analysisTooltip.hide();
        }

        if (this._errorTooltip) {
            this._errorTooltip.hide();
        }
    }
};

Track.prototype.rate = function(value) {
    if (!this.tagData) return;
    if (value === -1) {
        if (this.isRated()) {
            this.tagData.unsetRating();
            this.tagDataUpdated();
        }
        return;
    }
    value = Math.max(1, Math.min(+value, 5));
    if (!value) return;
    this.tagData.setRating(value);
    this.tagDataUpdated();
};

Track.prototype.ratingInputMouseLeft = function() {
    this.$ratingInputs().removeClass("rate-intent");
};

Track.prototype.ratingInputMouseEntered = function(e) {
    if (this.isRated()) return;
    var value = parseInt($(e.target).data("rating"), 10);
    this.$ratingInputs().removeClass("rate-intent");
    this.$ratingInputsForRatingValue(value).addClass("rate-intent");
};

Track.prototype.ratingInputClicked = function(e) {
    if (this.isRated()) return;
    var value = parseInt($(e.target).data("rating"), 10);
    this.tagData.setRating(value);
    this.tagDataUpdated();
};

Track.prototype.ratingInputDoubleClicked = util.throttle(function() {
    if (!this.isRated()) return;
    this.tagData.unsetRating();
    this.tagDataUpdated();
}, 100);

Track.prototype.isAttachedToDom = function() {
    return this._isAttached;
};

Track.prototype.getImage = Promise.method(function() {
    var image;
    if (this.tagData) {
        image = this.tagData.getImage();
    }
    if (!image) {
        image = this._generatedImage;
    }
    if (!image) {
        if (!this.tagData) {
            return PlayerPictureManager.getDefaultImage();
        }
        return PlayerPictureManager.generateImageForTrack(this).bind(this).tap(function(result) {
            this._generatedImage = result;
        });
    }
    return image;
});

Track.prototype.getImageUrl = function() {
    return this.getImage().get("src");
};

Track.prototype.isDetachedFromPlaylist = function() {
    return this.index === -1;
};

Track.prototype.getIndex = function() {
    return this.index;
};


Track.prototype.setIndex = function(index) {
    if (this.index === index) return;
    this.index = index;
    this.indexChanged();
    this.emit("indexChange", this.index);
};

Track.prototype.indexChanged = function() {
    var index = this.index;
    if (index >= 0) {
        this.setTrackNumber();
        this.$().css("transform", "translateY(" + index * playlist.main.getItemHeight() + "px");
    }
};

Track.prototype.doubleClicked = function() {
    playlist.main.changeTrackExplicitly(this);
};

Track.prototype.selected = function() {
    this.$().addClass("track-active");
};

Track.prototype.unselected = function() {
    this.$().removeClass("track-active");
};

Track.prototype.stopPlaying = function() {
    this.$().removeClass("track-playing");
};

Track.prototype.startPlaying = function() {
    this.$().addClass("track-playing");
};

Track.prototype.analysisEstimate = function(analysisEstimate) {
    this._analysisCompletionEstimate = analysisEstimate + Date.now();
    if (this._domNode !== NULL) {
        this.updateAnalysisEstimate();
    }
};

Track.prototype.updateAnalysisEstimate = function() {
    if (this._analysisCompletionEstimate === -1) return;
    var transitionDuration = this._analysisCompletionEstimate - Date.now();
    if (transitionDuration < 0) return;

    this.$().addClass("track-container-progress");
    var bar = $("<div>", {class: "track-progress-bar"}).appendTo(this.$());

    bar.css({
        "transitionDuration": (transitionDuration / 1000) + "s"
    });
    bar.width();
    requestAnimationFrame(function() {
        bar.css("transform", "translateX(0)");    
    });
};

Track.prototype.unsetAnalysisStatus = function() {
    this._isBeingAnalyzed = false;

    if (this._analysisTooltip) {
        this._analysisTooltip.destroy();
        this._analysisTooltip = null;
        this.$().removeClass("track-container-progress");
        this.$().find(".track-progress-bar").remove();
        this.$trackStatus().find(".track-analysis-status").remove();
        this.$trackStatus().removeClass("unclickable");
    }
};

Track.prototype.showAnalysisStatus = function() {
    if (this._domNode === NULL) return;

    this.$trackStatus().append("<span " +
        "class='glyphicon glyphicon-info-sign track-analysis-status icon'" +
        "></span>");

    this._analysisTooltip = new Tooltip({
        transitionClass: "fade-in",
        preferredDirection: "top",
        preferredAlign: "middle",
        container: $("body"),
        target: this.$trackStatus(),
        classPrefix: "app-tooltip autosized-tooltip minimal-size-tooltip",
        arrow: false,
        content: ANALYSIS_TOOLTIP_MESSAGE
    });
    this.$trackStatus().addClass("unclickable");
};

Track.prototype.showErrorStatus = function() {
    if (this._domNode === NULL) return;

    this.$trackStatus().append("<span " +
        "class='glyphicon glyphicon-exclamation-sign track-error-status icon'" +
        "></span>");

    this._errorTooltip = new Tooltip({
        transitionClass: "fade-in",
        preferredDirection: "top",
        preferredAlign: "middle",
        container: $("body"),
        target: this.$trackStatus(),
        classPrefix: "app-tooltip autosized-tooltip minimal-size-tooltip",
        arrow: false,
        content: ERROR_HEADER + this._error
    });
    this.$trackStatus().addClass("unclickable");
};

Track.prototype.unsetError = function() {
    this._error = null;

    if (this._errorTooltip) {
        this._errorTooltip.destroy();
        this._errorTooltip = null;
        this.$trackStatus().find(".track-error-status").remove();
        this.$trackStatus().removeClass("unclickable");
    }
};

Track.prototype.setError = function(message) {
    if (this._error && this._domNode !== NULL) {
        this._errorTooltip.destroy();
        this.$trackStatus().find(".track-error-status").remove();
    }
    this._error = message;
    this.showErrorStatus();
};

Track.prototype.hasError = function() {
    return !!this._error;
};

Track.prototype.getFileName = function() {
    return this.file.name;
};

Track.prototype.getFileSize = function() {
    return this.file.size;
};

Track.prototype.getFile = function() {
    return this.file;
};

Track.prototype.getTagData = function() {
    return this.tagData;
};

Track.prototype.setTagData = function(tagData) {
    if (this.tagData !== null) throw new Error("cannot set tagData again");
    this.tagData = tagData;
    this.tagDataUpdated();
};

Track.prototype.formatFullName = function() {
    var name = this.formatName();
    if (this.tagData && this.tagData.getAlbum()) {
        name = name + " [" + this.tagData.getAlbum() + "]";
    }
    return name;
};

Track.prototype.formatName = function() {
    if (this.tagData !== null) {
        return this.tagData.formatName();
    }
    var artistAndTitle = TagData.trackInfoFromFileName(this.getFileName());
    return artistAndTitle.artist + " - " + artistAndTitle.title;
};

Track.prototype.formatTime = function() {
    if (this.tagData !== null) {
        return this.tagData.formatTime();
    }
    return "";
};

Track.prototype.needsParsing = function() {
    return this.tagData === null && !this._error;
};

Track.prototype.getBasicInfo = function() {
    return this.tagData ? this.tagData.basicInfo : {
        channels: 2,
        sampleRate: 44100,
        duration: NaN
    };
};

Track.prototype.getRating = function() {
    if (!this.tagData) return -1;
    return this.tagData.getRating();
};

Track.prototype.isRated = function() {
    if (!this.tagData) return false;
    return this.tagData.isRated();
};

Track.prototype.tagDataUpdated = function() {
    this.setTrackDuration();
    this.setTrackInfo();
    this.setRatingStars();
    this.emit("tagDataUpdate", this);
};

Track.prototype.getUid = function() {
    if (this.tagData) {
        var album = this.tagData.taggedAlbum;
        var title = this.tagData.taggedTitle;
        var artist = this.tagData.taggedArtist;
        var index = this.tagData.albumIndex;
        var name = this.getFileName();
        var size = this.getFileSize();
        return sha1(album + title + artist + index + name + size);
    } else {
        throw new Error("cannot get uid before having tagData");
    }
};

Track.prototype.isBeingAnalyzed = function() {
    return this._isBeingAnalyzed;
};

Track.prototype.setAnalysisStatus = function() {
    this._isBeingAnalyzed = true;
    this.showAnalysisStatus();
};

Track.prototype.getSilenceAdjustedDuration = function(duration) {
    return Math.max(0, duration - this.getTotalSilenceLength());
};

Track.prototype.convertToSilenceAdjustedTime = function(rawCurrentTime) {
    var total = this.getTotalSilenceLength();
    if (!total || !this.tagData || !this.tagData.basicInfo.duration) return rawCurrentTime;
    return Math.max(0, rawCurrentTime - this.getBeginSilenceLength());
};

Track.prototype.convertFromSilenceAdjustedTime = function(currentTime) {
    var total = this.getTotalSilenceLength();
    if (!total || !this.tagData || !this.tagData.basicInfo.duration) return currentTime;
    var physicalDuration = this.tagData.basicInfo.duration;
    var logicalDuration = physicalDuration - total;
    currentTime = Math.min(logicalDuration, Math.max(0, currentTime));
    var startSilence = this.getBeginSilenceLength();
    currentTime += startSilence;

    if (currentTime >= logicalDuration + startSilence) {
        currentTime = physicalDuration;
    }
    return currentTime;
};

Track.prototype.getTotalSilenceLength = function() {
    if (!this.tagData) return 0;
    return this.tagData.getTotalSilenceLength();
};

Track.prototype.getBeginSilenceLength = function() {
    if (!this.tagData) return 0;
    return this.tagData.getBeginSilenceLength();
};

Track.prototype.comesBeforeInSameAlbum = function(otherTrack) {
    return this.isFromSameAlbumAs(otherTrack) &&
        this.tagData.albumIndex === otherTrack.tagData.albumIndex - 1;
};

Track.prototype.comesAfterInSameAlbum = function(otherTrack) {
    return this.isFromSameAlbumAs(otherTrack) &&
        this.tagData.albumIndex === otherTrack.tagData.albumIndex + 1;
};

Track.prototype.isFromSameAlbumAs = function(otherTrack) {
    if (!otherTrack) return false;
    if (otherTrack === this) return true;
    var thisTagData = this.getTagData();
    var otherTagData = otherTrack.getTagData();

    if (!thisTagData || !otherTagData) {
        return false;
    }

    var thisAlbum = thisTagData.getAlbum();
    var otherAlbum = otherTagData.getAlbum();

    if (!thisAlbum || !otherAlbum) {
        return false;
    }

    return thisAlbum === otherAlbum &&
           thisTagData.albumArtist === otherTagData.albumArtist;
};

Track.prototype.hasSilenceAtEnd = function() {
    if (this.tagData && this.tagData.endSilenceLength > 0) {
        return true;
    }
    return false;
};

Track.prototype.getSearchString = function() {
    if (this._searchString !== null) return this._searchString;
    var searchString = this.formatName().toLowerCase().replace(TagData.stripExtensionPattern, "")
                                    .replace(util.unicode.alphaNumericFilteringPattern, "");
    this._searchString = searchString;
    return searchString;
};

Track.prototype.played = function() {
    this.unsetError();
    this._lastPlayed = Date.now();
};

Track.prototype.hasBeenPlayedWithin = function(time) {
    return this._lastPlayed >= time;
};

Track.prototype.fetchAcoustIdImage = function() {
    return this.tagData.fetchAcoustIdImage();
};

Track.prototype.shouldRetrieveAcoustIdImage = function() {
    return !!(this.tagData && this.tagData.shouldRetrieveAcoustIdImage());
};

const rType =
    /(?:(RIFF....WAVE)|(ID3|\xFF[\xF0-\xFF][\x02-\xEF][\x00-\xFF])|(\xFF\xF1|\xFF\xF9)|(\x1A\x45\xDF\xA3)|(OggS))/;
Track.WAV = 0;
Track.MP3 = 1;
Track.AAC = 2;
Track.WEBM = 3;
Track.OGG = 4;
Track.UNKNOWN_FORMAT = 9999;

const formats = [
    [/^(audio\/vnd.wave|audio\/wav|audio\/wave|audio\/x-wav)$/, Track.WAV],
    [/^(audio\/mpeg|audio\/mp3)$/, Track.MP3],
    [/^(audio\/aac|audio\/aacp|audio\/3gpp|audio\/3gpp2|audio\/mp4|audio\/MP4A-LATM|audio\/mpeg4-generic)$/, Track.AAC],
    [/^(audio\/webm)$/, Track.WEBM],
    [/^(audio\/ogg|application\/ogg|audio\/x-ogg|application\/x-ogg)$/, Track.OGG],
];

Track.prototype.getFormat = function(initialBytes) {
    var type = this.file.type.toLowerCase();
    var matches;
    if (type) {
        var matches = formats.filter(function(v) {
            return v[0].test(type);
        });
    }

    if (type && matches.length) {
        return matches[0][1];
    } else if (!type) {
        var match = rType.exec(initialBytes.slice(0, 10));
        for (var i = 0; i < formats.length; ++i) {
            if (match[formats[i][1] + 1] !== undefined) {
                return formats[i][1];
            }
        }

        return Track.UNKNOWN_FORMAT;
    } else {
        return Track.UNKNOWN_FORMAT;
    }
};

module.exports = Track;
