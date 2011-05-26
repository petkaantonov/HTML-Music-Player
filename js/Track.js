var Track = (function() {"use strict";

const DEFAULT_IMAGE_URL = "/dist/images/icon.png";

const ANALYSIS_TOOLTIP_MESSAGE =
"<p>This track is currently being analyzed for loudness normalization, silence removal and clipping protection.</p>" +
"<p>Playing this track before the analysis has been completed can lead to a below acceptable listening experience.</p>";

function Track(audioFile) {
    EventEmitter.call(this);
    this.file = audioFile;
    this.tagData = null;
    this.error = false;
    this.index = -1;
    this._domNode = this._createDomNode();
    this._searchString = null;
    this._isAttached = false;
    this._lastPlayed = 0;
    this._statusTooltip = null;
    this.setTrackDuration(this.formatTime());
    this.setTrackText(this.formatName());
}
util.inherits(Track, EventEmitter);


const NULL = $(null);

Track.prototype._createDomNode = function() {
    var self = this;
    var dom = $("<div>", {
        class: "app-track-container"
    }).html("<div class='app-track'>" +
        "<span class='app-track-name notextflow'>" +
            "<span></span>. " +
            "<span></span>" +
        "</span>" +
        "<span class='app-track-status'></span>" +
        "<span class='app-track-time'></span>" +
        "<span class='app-track-rating'>" +
            "<span data-rating='1' class='glyphicon glyphicon-star rating-input'></span>" +
            "<span data-rating='2' class='glyphicon glyphicon-star rating-input'></span>" +
            "<span data-rating='3' class='glyphicon glyphicon-star rating-input'></span>" +
            "<span data-rating='4' class='glyphicon glyphicon-star rating-input'></span>" +
            "<span data-rating='5' class='glyphicon glyphicon-star rating-input'></span>" +
        "</span>" +
        "</div>" +
    "</div>");

    dom.find(".app-track-rating").on("mouseenter mouseleave click mousedown dblclick", ".rating-input", function(e) {
        e.stopImmediatePropagation();
        if (e.type === "mouseenter") return self.ratingInputMouseEntered(e);
        if (e.type === "mouseleave") return self.ratingInputMouseLeft(e);
        if (e.type === "click") return self.ratingInputClicked(e);
        if (e.type === "dblclick") return self.ratingInputDoubleClicked(e);
    });

    dom.find(".app-track")
        .on("dblclick", function(e) {
            self.doubleClicked(e);
        })
        .height(playlist.main.getItemHeight());
    return dom;
};

Track.prototype.$ = function() {
    return this._domNode;
};

Track.prototype.$container = function() {
    return this.$().find(".app-track");
};

Track.prototype.$trackStatus = function() {
    return this.$().find(".app-track-status");
};

Track.prototype.$trackName = function() {
    return this.$().find(".app-track-name span").last();
};

Track.prototype.$trackNumber = function() {
    return this.$().find(".app-track-name span").first();
};

Track.prototype.$trackTime = function() {
    return this.$().find(".app-track-time");
};

Track.prototype.$ratingInputs = function() {
    return this.$().find(".rating-input");
};

Track.prototype.$ratingInputsForRatingValue = function(value) {
    return this.$ratingInputs().filter(function() {
        return parseInt($(this).data("rating"), 10) <= value;
    });
};

Track.prototype.registerToSelectable = function(selectable) {
    var self = this;
    this.$()
        .on("click", function(e) {
            if ($(e.target).closest(".app-track-rating").length) {
                return;
            }
            return selectable.trackClick(e, self);
        })
        .on("mousedown", function(e) {
            if ($(e.target).closest(".app-track-rating").length) {
                return;
            }
            return selectable.trackMouseDown(e, self);
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

Track.prototype.bringInTrackAfter = function(delay) {
    this.$().css("visibility", "hidden");
    var self = this;
    setTimeout(function() {
        self.$().css("visibility", "visible");
    }, 400);
};

Track.prototype.remove = function() {
    this.index = -1;
    this._isAttached = false;

    if (this._statusTooltip) {
        this._statusTooltip.destroy();
    }

    if (this.tagData) {
        this.tagData.destroy();
    }

    this.$().remove();
    this._domNode = NULL;
};

Track.prototype.attach = function(target) {
    this._isAttached = true;
    this.$().appendTo(target);
};

Track.prototype.detach = function() {
    if (this.$().parent().length) {
        this.$().detach();
        this._isAttached = false;
        if (this._statusTooltip) {
            this._statusTooltip.hide();
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

Track.prototype.ratingInputMouseLeft = function(e) {
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

Track.prototype.ratingInputDoubleClicked = function(e) {
    if (!this.isRated()) return;
    this.tagData.unsetRating();
    this.tagDataUpdated();
};

Track.prototype.isAttachedToDom = function() {
    return this._isAttached;
};

Track.prototype.setTrackText = function(text) {
    this.$trackName().text(text);
};

Track.prototype.setTrackNumber = function(number) {
    this.$trackNumber().text(number);
};

Track.prototype.setTrackDuration = function(duration) {
    this.$trackTime().text(duration);
};

Track.prototype.setRatingStars = function(ratingValue) {
    this.$ratingInputs().removeClass("rate-intent rated");

    if (ratingValue === -1) {
        this.$().find(".app-track-rating").removeClass("already-rated");
    } else {
        this.$().find(".app-track-rating").addClass("already-rated");
        this.$ratingInputsForRatingValue(ratingValue).addClass("rated");
    }
};

Track.prototype.getImageUrl = function() {
    if (!this.tagData) return DEFAULT_IMAGE_URL;
    return this.tagData.getImageUrl() || DEFAULT_IMAGE_URL;
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
    if (index >= 0) {
        this.setTrackNumber(index + 1);
        this.$().css("top", index * playlist.main.getItemHeight());
    }
    this.emit("indexChange", this.index);
};

Track.prototype.doubleClicked = function(event) {
    if (this === playlist.main.getCurrentTrack()) {
        player.main.resume();
    } else {
        playlist.main.changeTrackExplicitly(this);
    }
};

Track.prototype.selected = function() {
    this.$container().addClass("app-track-active");
};

Track.prototype.unselected = function() {
    this.$container().removeClass("app-track-active");
};

Track.prototype.stopPlaying = function() {
    this.$container().removeClass("app-playing");
};

Track.prototype.startPlaying = function() {
    this.$container().addClass("app-playing");
};

Track.prototype.hasError = function() {
    return this.error;
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
    this.$().find(".app-track-rating").addClass("visible");
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
    return this.getFileName();
};

Track.prototype.formatTime = function() {
    if (this.tagData !== null) {
        return this.tagData.formatTime();
    }
    return "";
};

Track.prototype.needsParsing = function() {
    return this.tagData === null && !this.error;
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
    this.setTrackDuration(this.formatTime());
    this.setTrackText(this.formatName());
    this.setRatingStars(this.getRating());
    this.emit("tagDataUpdate");
};

Track.prototype.getUid = function() {
    if (this.tagData) {
        var album = this.tagData.album;
        var title = this.tagData.title;
        var artist = this.tagData.artist;
        var index = this.tagData.albumIndex;
        var name = this.getFileName();
        var size = this.getFileSize();
        return sha1(album + title + artist + index + name + size);
    } else {
        return sha1(this.getFileName() + "" + this.getFileSize());
    }
};

Track.prototype.unsetAnalysisStatus = function() {
    this.$trackStatus().empty();
    this._statusTooltip.destroy();
    this._statusTooltip = null;
};

Track.prototype.setAnalysisStatus = function() {
    var self = this;
    this.$trackStatus().html("<span " +
        "class='glyphicon glyphicon-warning-sign track-analysis-status'" +
        "></span>");

    this._statusTooltip = new Tooltip({
        transitionClass: "fade-in",
        preferredDirection: "right",
        preferredAlign: "middle",
        container: $("body"),
        target: this.$trackStatus().find(".track-analysis-status"),
        classPrefix: "app-tooltip",
        content: ANALYSIS_TOOLTIP_MESSAGE
    });
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

    return thisAlbum.toLowerCase() === otherAlbum.toLowerCase();
};

Track.prototype.getSearchString = function() {
    if (this._searchString !== null) return this._searchString;
    var searchString = this.formatName().toLowerCase().replace(stripExtensionPattern, "")
                                    .replace(util.unicode.alphaNumericFilteringPattern, "");
    this._searchString = searchString;
    return searchString;
};

Track.prototype.played = function() {
    this._lastPlayed = Date.now();
};

Track.prototype.hasBeenPlayedWithin = function(time) {
    return this._lastPlayed >= time;
};

Track.WAV = 0
Track.MP3 = 1;
Track.AAC = 2;
Track.WEBM = 3;
Track.OGG = 4;

Track.UNKNOWN_FORMAT = 9999;

const MPEGSyncWord = /\xFF[\xF0-\xFF][\x02-\xEF][\x00-\xFF]/;

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
        initialBytes = initialBytes.slice(0, 10);

        if (initialBytes.indexOf("ID3") !== -1 ||
            MPEGSyncWord.test(initialBytes)) {
            return Track.MP3
        } else if (initialBytes.indexOf("RIFF") !== -1 &&
                   initialBytes.indexOf("WAVE") !== -1) {
            return Track.WAV;
        } else if (initialBytes.indexOf("OggS") !== -1) {
            return Track.OGG
        } else if (initialBytes.indexOf("\xFF\xF1") !== -1 ||
                   initialBytes.indexOf("\xFF\xF9") !== -1) {
            return Track.AAC
        } else if (initialBytes.indexOf("\x1A\x45\xDF\xA3") !== -1) {
            return Track.WEBM;
        } else {
            return Track.UNKNOWN_FORMAT;
        }
    } else {
        return Track.UNKNOWN_FORMAT;
    }
};

return Track;})();
