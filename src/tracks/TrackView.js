const ANALYSIS_TOOLTIP_MESSAGE = [
    `This track is currently being analyzed for loudness normalization, silence removal, clipping protection and fingerprinting.`,
    `Playing this track before the analysis has been completed may require manually adjusting volume.`
];

const ERROR_HEADER = [
    `There was an error with this track:`
];

export default function TrackView(track, opts) {
    opts = Object(opts);
    this._opts = opts;
    this._track = track;
    this._isDestroyed = false;
    this._index = -1;
    this._error = null;
    this._domNode = null;
    this._isAttached = false;
    this._analysisProgress = -1;
    this._analysisProgressUpdateFrameQueued = false;
    this._dragged = false;
    this._offset = 0;
    this._viewUpdated = this._viewUpdated.bind(this);
    this._track.on(`viewUpdate`, this._viewUpdated);
}

TrackView.prototype.selectable = function() {
    return this._opts.selectable;
};

TrackView.prototype.page = function() {
    return this._opts.page;
};

TrackView.prototype.shouldUpdateTrackIndex = function() {
    return this._opts.updateTrackIndex;
};

TrackView.prototype.playlist = function() {
    return this._opts.playlist;
};

TrackView.prototype.itemHeight = function() {
    return this._opts.itemHeight;
};

TrackView.prototype.tooltipContext = function() {
    return this._opts.tooltipContext;
};

TrackView.prototype.$ = function() {
    return this._domNode;
};

TrackView.prototype.$container = function() {
    return this.$().find(`.track`);
};

TrackView.prototype.$trackStatus = function() {
    return this.$().find(`.track-status`);
};

TrackView.prototype.$trackNumber = function() {
    return this.$().find(`.track-number`);
};

TrackView.prototype.$trackDuration = function() {
    return this.$().find(`.track-duration`);
};

TrackView.prototype.track = function() {
    return this._track;
};

TrackView.prototype._shouldUpdateDom = function() {
    return this._domNode !== null;
};

TrackView.prototype._ensureDomNode = function(recycledDomNode, target) {
    if (this._shouldUpdateDom()) return;

    this._domNode = recycledDomNode || this.page().createElement(`div`, {
        class: `track-container`
    }).setHtml(`<div class='track'>
        <div class='track-status'>
            <span class='glyphicon glyphicon-info-sign track-analysis-status icon' style="display: none;"></span>
            <span class='glyphicon glyphicon-exclamation-sign track-error-status icon' style="display: none;"></span>
            <span class='icon glyphicon glyphicon-volume-up playing-icon'></span>
        </div>
        <div class='track-number'></div>
        <div class='track-info'>
            <div class='track-title notextflow'></div>
            <div class='track-artist notextflow'></div>
        </div>
        <div class='track-duration'></div>
        <div class='track-availability'>
            <div class='track-availability-item offline'>
                <span class='material-icons icon offline_pin'></span>
                <div class='text'>Offline</div>
            </div>
            <div class='track-availability-item cloud'>
                <span class='material-icons icon cloud_upload'></span>
                <div class='text'>Sync</div>
            </div>
        </div>
    </div>`);

    if (this.selectable().contains(this)) {
        this.selected();
    } else {
        this.unselected();
    }

    if (this._dragged) {
        this.$().addClass(`track-dragging`);
    } else {
        this.$().removeClass(`track-dragging`);
    }

    this.viewUpdateTagDataChange();
    //this.viewUpdateOfflineStatusChange();
    //this.viewUpdateSyncStatusChange();
    this.viewUpdatePlayingStatusChange(this.playlist().getCurrentTrack() === this._track);

    let unclickableTrackStatus = false;
    if (this._track.isBeingAnalyzed()) {
        this.viewUpdateShowAnalysisStatus();
        unclickableTrackStatus = true;
    } else {
        this.viewUpdateHideAnalysisStatus();
    }

    if (this._track.hasError()) {
        this.viewUpdateShowErrorStatus();
        unclickableTrackStatus = true;
    } else {
        this.viewUpdateHideErrorStatus();
    }

    if (unclickableTrackStatus) {
        this.$trackStatus().addClass(`unclickable`);
    } else {
        this.$trackStatus().removeClass(`unclickable`);
    }

    this._updateTranslate();

    if (!recycledDomNode && target) {
        this.$().appendTo(target);
    }
};

TrackView.prototype.isDestroyed = function() {
    return this._isDestroyed;
};

TrackView.prototype.destroy = function() {
    if (this._isDestroyed) return false;
    this._track.removeListener(`viewUpdate`, this._viewUpdated);
    this._index = -1;
    this._isDestroyed = true;
    return true;
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
        if (this._shouldUpdateDom()) {
            this._updateTranslate();
        }
    }

    if (this.shouldUpdateTrackIndex() && this._track) {
        this._track.setIndex(index);
    }
};

TrackView.prototype.getIndex = function() {
    return this._index;
};

TrackView.prototype._viewUpdated = function(methodName, ...args) {
    if (args.length > 0) {
        this[methodName](...args);
    } else {
        this[methodName]();
    }
};

TrackView.prototype.renderTrackInfo = function() {
    const artistAndTitle = this._track.getTrackInfo();

    this.$().find(`.track-title`).setText(artistAndTitle.title);
    this.$().find(`.track-artist`).setText(artistAndTitle.artist);
};

TrackView.prototype.renderTrackNumber = function() {
    this.$trackNumber().setText(`${this._track.getIndex() + 1}.`);
};

TrackView.prototype.renderTrackDuration = function() {
    this.$trackDuration().setText(this._track.formatTime());
};

TrackView.prototype.attach = function(target, node) {
    this._ensureDomNode(node, target);
    this._isAttached = true;
};

TrackView.prototype.detach = function() {
    if (this._isAttached) {
        this._isAttached = false;
        const node = this._domNode;
        this._domNode = null;
        return node;
    }
    return null;
};

TrackView.prototype.selected = function() {
    if (!this._shouldUpdateDom()) return;
    this.$().addClass(`track-active`);
};

TrackView.prototype.unselected = function() {
    if (!this._shouldUpdateDom()) return;
    this.$().removeClass(`track-active`);
};

TrackView.prototype.viewUpdateDestroyed = function() {
    this.destroy();
};

TrackView.prototype.viewUpdateOfflineStatusChange = function() {
    if (!this._shouldUpdateDom()) return;
    if (this._track.isAvailableOffline()) {
        this.$().find(`.offline`).addClass(`active`);
    } else {
        this.$().find(`.offline`).removeClass(`active`);
    }
};

TrackView.prototype.viewUpdateSyncStatusChange = function() {
    if (!this._shouldUpdateDom()) return;
    if (this._track.isSyncedToCloud()) {
        this.$().find(`.cloud`).addClass(`active`);
    } else {
        this.$().find(`.cloud`).removeClass(`active`);
    }
};

TrackView.prototype.viewUpdatePlayingStatusChange = function(playingStatus) {
    if (!this._shouldUpdateDom()) return;
    if (playingStatus) {
        this.$().addClass(`track-playing`);
    } else {
        this.$().removeClass(`track-playing`);
    }
};

TrackView.prototype._updateAnalysisProgress = function() {
    if (!this._analysisProgressUpdateFrameQueued) {
        this._analysisProgressUpdateFrameQueued = true;
    }
};

TrackView.prototype.viewUpdateAnalysisProgress = function(analysisProgress) {
    if (!this._shouldUpdateDom()) return;
    this._analysisProgress = analysisProgress;
    this._updateAnalysisProgress();
};

TrackView.prototype.viewUpdateHideAnalysisStatus = function() {
    if (!this._shouldUpdateDom()) return;
    this.$trackStatus().find(`.track-analysis-status`).hide();
};

TrackView.prototype.viewUpdateShowAnalysisStatus = function() {
    if (!this._shouldUpdateDom()) return;
    this.$trackStatus().find(`.track-analysis-status`).show(`inline-block`);
};

TrackView.prototype.viewUpdateShowErrorStatus = function() {
    if (!this._shouldUpdateDom()) return;
    this.$trackStatus().find(`.track-error-status`).show(`inline-block`);
};

TrackView.prototype.viewUpdateHideErrorStatus = function() {
    if (!this._shouldUpdateDom()) return;
    this.$trackStatus().find(`.track-error-status`).hide();
};

TrackView.prototype.viewUpdatePositionChange = function() {
    if (!this._shouldUpdateDom()) return;
    this.renderTrackNumber();
};

TrackView.prototype.viewUpdateTagDataChange = function() {
    if (!this._shouldUpdateDom()) return;
    this.renderTrackNumber();
    this.renderTrackDuration();
    this.renderTrackInfo();
};

TrackView.prototype._updateTranslate = function() {
    this.$().setTransform(this._getTranslate());
};

TrackView.prototype._getTranslate = function() {
    const index = this._index;
    let y = index * this.itemHeight();
    let x = 0;
    if (this._dragged) {
        x -= 25;
        y -= 10;
    }
    y += this._offset;
    return `translate(${x}px, ${y}px)`;
};

TrackView.prototype.setOffset = function(value) {
    this._offset = value;
    if (!this._shouldUpdateDom()) return;
    this._updateTranslate();
};

TrackView.prototype.startDragging = function() {
    if (this._dragged) return;
    this._dragged = true;
    if (!this._shouldUpdateDom()) return;
    this.$().addClass(`track-dragging`).removeClass(`transition`);
    this._updateTranslate();
};

TrackView.prototype.stopDragging = function() {
    if (!this._dragged) return;
    this._dragged = false;
    this._offset = 0;
    if (!this._shouldUpdateDom()) return;
    this.$().removeClass(`track-dragging`).addClass(`transition`);
    this._updateTranslate();

    this.page().setTimeout(() => {
        if (!this._shouldUpdateDom()) return;
        this.$().removeClass(`transition`);
    }, 220);

};
