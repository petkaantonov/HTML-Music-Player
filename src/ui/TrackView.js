"use strict";

import EventEmitter from "lib/events";
import { setTransform } from "lib/DomUtil";
import Tooltip from "ui/Tooltip";
const NULL = $(null);
const ANALYSIS_TOOLTIP_MESSAGE =
"<p>This track is currently being analyzed for loudness normalization, silence removal, clipping protection and fingerprinting.</p>" +
"<p>Playing this track before the analysis has been completed may require manually adjusting volume.</p>";

const ERROR_HEADER = "<p>There was an error with this track:</p>";

export default function TrackView(track, selectable, opts) {
    opts = Object(opts);
    this._track = track;
    this._isDestroyed = false;
    this._index = -1;
    this._playlist = opts.playlist;
    this._itemHeight = opts.itemHeight;
    this._error = null;
    this._domNode = NULL;
    this._isAttached = false;
    this._errorTooltip = null;
    this._analysisTooltip = null;
    this._analysisCompletionEstimate = -1;
    this._dragged = false;
    this._offset = 0;
    this._renderedPlayingStatus = false;
    this._selectable = selectable;

    this.updateTrackIndex = !!opts.updateTrackIndex;
    this.updateSearchDisplayStatus = !!opts.updateSearchDisplayStatus;

    this._viewUpdated = this._viewUpdated.bind(this);

    this._track.on("viewUpdate", this._viewUpdated);

    if (this.updateSearchDisplayStatus) {
        if (track._isDisplayedAsSearchResult) {
            throw new Error("duplicate search result view for this track");
        }
        track._isDisplayedAsSearchResult = true;
    }
}

TrackView.prototype.$ = function() {
    return this._domNode;
};

TrackView.prototype.$container = function() {
    return this.$().find(".track");
};

TrackView.prototype.$trackStatus = function() {
    return this.$().find(".track-status");
};

TrackView.prototype.$trackNumber = function() {
    return this.$().find(".track-number");
};

TrackView.prototype.$trackDuration = function() {
    return this.$().find(".track-duration");
};

TrackView.prototype.track = function() {
    return this._track;
};

TrackView.prototype._ensureDomNode = function() {
    if (this._domNode !== NULL) return;
    var selectable = this._selectable;
    var self = this;
    this._domNode = $("<div>", {
        class: "track-container"
    }).html("<div class='track'>                                                                      \
        <div class='track-status'>                                                                    \
            <span class='icon glyphicon glyphicon-volume-up playing-icon'></span>                     \
        </div>                                                                                        \
        <div class='track-number'></div>                                                              \
        <div class='track-info'>                                                                      \
            <div class='track-title notextflow'></div>                                                \
            <div class='track-artist notextflow'></div>                                               \
        </div>                                                                                        \
        <div class='track-duration'></div>                                                            \
        <div class='track-availability'>                                                              \
            <div class='track-availability-item offline'>                                             \
                <span class='material-icons icon offline_pin'></span>                                 \
                <div class='text'>Offline</div>                                                       \
            </div>                                                                                    \
            <div class='track-availability-item cloud'>                                               \
                <span class='material-icons icon cloud_upload'></span>                                \
                <div class='text'>Sync</div>                                                          \
            </div>                                                                                    \
        </div>                                                                                        \
    </div>");

    if (selectable.contains(this)) {
        this.selected();
    }

    if (this._dragged) {
        this.$().addClass("track-dragging");
    }

    this.viewUpdateTagDataChange();
    this.viewUpdateOfflineStatusChange();
    this.viewUpdateSyncStatusChange();
    this.viewUpdatePlayingStatusChange(this._playlist.getCurrentTrack() === this._track);

    if (this._track.isBeingAnalyzed()) {
        this.viewUpdateShowAnalysisStatus();
    }

    if (this._track.hasError()) {
        this.viewUpdateShowErrorStatus();
    }

    this._updateTranslate();
};

TrackView.prototype.isDestroyed = function() {
    return this._isDestroyed;
};

TrackView.prototype.destroy = function() {
    if (this._isDestroyed) return;
    if (this.updateSearchDisplayStatus) {
        if (!this._track._isDisplayedAsSearchResult) {
            throw new Error("track is not displayed as search result");
        }
        this._track._isDisplayedAsSearchResult = false;
    }
    this.destroyTooltips();
    this._track.removeListener("viewUpdate", this._viewUpdated);
    this.$().remove();
    this._domNode = NULL;
    this._track = null;
    this._selectable = null;
    this._isAttached = false;
    this._isDestroyed = true;
};

TrackView.prototype.isDetachedFromPlaylist = function() {
    return !this._track || this._track.isDetachedFromPlaylist();
};

TrackView.prototype.isVisible = function() {
    return this._isAttached;
};

TrackView.prototype.setIndex = function(index) {
    if (this._index !== index) {
        this._index = index;
        if (this._domNode !== NULL) {
            this._updateTranslate();
        }
    }

    if (this.updateTrackIndex && this._track) {
        this._track.setIndex(index);
    }
};

TrackView.prototype.getIndex = function() {
    return this._index;
};

TrackView.prototype._viewUpdated = function(methodName) {
    var args = [];
    for (var i = 1; i < arguments.length; ++i) {
        args[i - 1] = arguments[i];
    }

    if (args.length > 0) {
        this[methodName].apply(this, args);
    } else {
        this[methodName]();
    }
};

TrackView.prototype.renderTrackInfo = function() {
    var artistAndTitle = this._track.getTrackInfo();

    this.$().find(".track-title").text(artistAndTitle.title);
    this.$().find(".track-artist").text(artistAndTitle.artist);
};

TrackView.prototype.renderTrackNumber = function() {
    this.$trackNumber().text((this._track.getIndex() + 1) + ".");
};

TrackView.prototype.renderTrackDuration = function() {
    this.$trackDuration().text(this._track.formatTime());
};

TrackView.prototype.destroyTooltips = function() {
    if (this._analysisTooltip) {
        this._analysisTooltip.destroy();
        this._analysisTooltip = null;
    }

    if (this._errorTooltip) {
        this._errorTooltip.destroy();
        this._errorTooltip = null;
    }
};

TrackView.prototype.stageRemoval = function() {
    this.detach();
    this.$().remove();
    this._domNode = NULL;
};

TrackView.prototype.unstageRemoval = function() {
    this._ensureDomNode();
};

TrackView.prototype.attach = function(target) {
    this._ensureDomNode();
    this._isAttached = true;
    this.$().appendTo(target);
};

TrackView.prototype.detach = function() {
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

TrackView.prototype.selected = function() {
    if (this._domNode === NULL) return;
    this.$().addClass("track-active");
};

TrackView.prototype.unselected = function() {
    if (this._domNode === NULL) return;
    this.$().removeClass("track-active");
};

TrackView.prototype._updateAnalysisEstimate = function() {
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
        setTransform(bar[0], "translateX(0)");
    });
};

TrackView.prototype.viewUpdateAnalysisEstimate = function(analysisEstimate) {
    this._analysisCompletionEstimate = analysisEstimate + Date.now();
    if (this._domNode !== NULL) {
        this._updateAnalysisEstimate();
    }
};

TrackView.prototype.viewUpdateDestroyed = function() {
    this.destroy();
};

TrackView.prototype.viewUpdateOfflineStatusChange = function() {
    if (this._domNode === NULL) return;
    if (this._track.isAvailableOffline()) {
        this.$().find(".offline").addClass("active");
    } else {
        this.$().find(".offline").removeClass("active");
    }
};

TrackView.prototype.viewUpdateSyncStatusChange = function() {
    if (this._domNode === NULL) return;
    if (this._track.isSyncedToCloud()) {
        this.$().find(".cloud").addClass("active");
    } else {
        this.$().find(".cloud").removeClass("active");
    }
};

TrackView.prototype.viewUpdatePlayingStatusChange = function(playingStatus) {
    if (this._domNode === NULL) return;
    if (this._renderedPlayingStatus === playingStatus) return;
    this._renderedPlayingStatus = playingStatus;

    if (playingStatus) {
        this.$().addClass("track-playing");
    } else {
        this.$().removeClass("track-playing");
    }
};

TrackView.prototype.viewUpdateHideAnalysisStatus = function() {
    this._analysisCompletionEstimate = -1;

    if (this._analysisTooltip) {
        this._analysisTooltip.destroy();
        this._analysisTooltip = null;

        if (this._domNode !== NULL) {
            this.$().removeClass("track-container-progress");
            this.$().find(".track-progress-bar").remove();
            this.$trackStatus().find(".track-analysis-status").remove();
            this.$trackStatus().removeClass("unclickable");
        }
    }
};

TrackView.prototype.viewUpdateShowAnalysisStatus = function() {
    if (this._domNode === NULL) return;

    this.$trackStatus().append("<span " +
        "class='glyphicon glyphicon-info-sign track-analysis-status icon'" +
        "></span>");

    this._analysisTooltip = this._playlist.tooltipMaker.makeTooltip(this.$trackStatus(),
                                                                    ANALYSIS_TOOLTIP_MESSAGE);
    this.$trackStatus().addClass("unclickable");
    this._updateAnalysisEstimate();
};

TrackView.prototype.viewUpdateShowErrorStatus = function() {
    if (this._domNode === NULL) return;

    this.$trackStatus().append("<span " +
        "class='glyphicon glyphicon-exclamation-sign track-error-status icon'" +
        "></span>");

    this._errorTooltip = this._playlist.tooltipMaker.makeTooltip(this.$trackStatus(),
                                                                 ERROR_HEADER + this._track._error);
    this.$trackStatus().addClass("unclickable");
};

TrackView.prototype.viewUpdateHideErrorStatus = function() {
    if (this._domNode !== NULL) {
        if (this._errorTooltip) {
            this._errorTooltip.destroy();
            this._errorTooltip = null;
        }
        this.$trackStatus().find(".track-error-status").remove();
        this.$trackStatus().removeClass("unclickable");
    }
};

TrackView.prototype.viewUpdatePositionChange = function() {
    if (this._domNode === NULL) return;
    this.renderTrackNumber();
};

TrackView.prototype.viewUpdateTagDataChange = function() {
    if (this._domNode === NULL) return;
    this.renderTrackNumber();
    this.renderTrackDuration();
    this.renderTrackInfo();
};

TrackView.prototype._updateTranslate = function() {
    setTransform(this.$()[0], this._getTranslate());
};

TrackView.prototype._getTranslate = function() {
    var index = this._index;
    var y = index * this._itemHeight;
    var x = 0;
    if (this._dragged) {
        x -= 25;
        y -= 10;
    }
    y += this._offset;
    return "translate("+x+"px, "+y+"px)";
};

TrackView.prototype.setOffset = function(value) {
    this._offset = value;
    if (this._domNode !== NULL) {
        this._updateTranslate();
    }
};

TrackView.prototype.startDragging = function() {
    if (this._dragged) return;
    this._dragged = true;
    if (this._domNode !== NULL) {
        this.$().addClass("track-dragging").removeClass("transition");
        this._updateTranslate();
    }
};

TrackView.prototype.stopDragging = function() {
    if (!this._dragged) return;
    this._dragged = false;
    this._offset = 0;
    if (this._domNode !== NULL) {
        this.$().removeClass("track-dragging").addClass("transition");
        this._updateTranslate();
        var self = this;
        setTimeout(function() {
            var node = self.$();
            if (node) node.removeClass("transition");
        }, 220);
    }
};
