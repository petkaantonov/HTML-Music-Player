

import TrackView from "tracks/TrackView";
import {inherits} from "util";

export default function SearchResultTrackView(track, result, opts) {
    TrackView.call(this, track, opts);
    this._result = result;
    if (track._isDisplayedAsSearchResult) {
        throw new Error(`duplicate search result view for this track`);
    }
    track._isDisplayedAsSearchResult = true;
}
inherits(SearchResultTrackView, TrackView);

SearchResultTrackView.prototype.search = function() {
    return this._opts.search;
};

SearchResultTrackView.prototype.destroy = function() {
    if (!this.destroy$()) return false;
    if (!this._track._isDisplayedAsSearchResult) {
        throw new Error(`track is not displayed as search result`);
    }
    this._track._isDisplayedAsSearchResult = false;
    this._result = null;
    return true;
};

SearchResultTrackView.prototype.viewUpdateDestroyed = function() {
    // NOOP
};
