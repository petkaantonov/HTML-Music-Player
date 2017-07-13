import TrackView from "tracks/TrackView";

export default class SearchResultTrackView extends TrackView {
    constructor(track, result, opts) {
        super(track, opts);
        this._result = result;
        if (track._isDisplayedAsSearchResult) {
            throw new Error(`duplicate search result view for this track`);
        }
        track._isDisplayedAsSearchResult = true;
    }

    search() {
        return this._opts.search;
    }

    destroy() {
        if (!this.destroy$()) return false;
        if (!this._track._isDisplayedAsSearchResult) {
            throw new Error(`track is not displayed as search result`);
        }
        this._track._isDisplayedAsSearchResult = false;
        this._result = null;
        return true;
    }

    viewUpdateDestroyed() {
        // NOOP
    }
}
