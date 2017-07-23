import {ITEM_ORDER_CHANGE_EVENT} from "tracks/TrackContainerController";

const compareAlbum = function(a, b) {
    return a.getAlbumForSort().localeCompare(b.getAlbumForSort());
};

const compareAlbumIndex = function(a, b) {
    return a.getAlbumIndexForSort() - b.getAlbumIndexForSort();
};

const compareDiscNumber = function(a, b) {
    return a.getDiscNumberForSort() - b.getDiscNumberForSort();
};

const compareTitle = function(a, b) {
    return a.getTitleForSort().localeCompare(b.getTitleForSort());
};

const compareAlbumArtist = function(a, b) {
    return a.getAlbumArtistForSort().localeCompare(b.getAlbumArtistForSort());
};

const compareArtist = function(a, b) {
    return a.getArtistForSort().localeCompare(b.getArtistForSort());
};

const compareDuration = function(a, b) {
    return a.duration - b.duration;
};

const compareRating = function(a, b) {
    const aRating = a.getRating();
    const bRating = b.getRating();

    if (aRating === -1) return bRating !== -1 ? 1 : 0;
    else if (bRating === -1) return -1;

    return bRating - aRating;
};

const compareOrder = [
    compareAlbum,
    compareDiscNumber,
    compareAlbumIndex,
    compareAlbumArtist,
    compareArtist,
    compareTitle,
    compareRating,
    compareDuration
];

const makeComparer = function(mainComparer) {
    const comparers = compareOrder.slice(0);
    comparers.splice(comparers.indexOf(mainComparer), 1);
    const {length} = comparers;

    const comparer = function(aTrackView, bTrackView) {
        const aTrack = aTrackView.track();
        const bTrack = bTrackView.track();
        let comparison;

        if (aTrack === bTrack) {
            return 0;
        }

        if ((comparison = mainComparer(aTrack, bTrack)) !== 0) {
            return comparison;
        }

        for (let i = 0; i < length; ++i) {
            const theComparer = comparers[i];
            if ((comparison = theComparer(aTrack, bTrack)) !== 0) {
                return comparison;
            }
        }

        return aTrack.formatName().localeCompare(bTrack.formatName());
    };

    const sorter = function(tracks) {
        tracks.sort(comparer);
    };

    return {
        comparer() {
            return this.changeTrackOrderWithinSelection(sorter);
        }
    };
};

export default {
    sortByAlbum: makeComparer(compareAlbum).comparer,
    sortByAlbumArtist: makeComparer(compareAlbumArtist).comparer,
    sortByArtist: makeComparer(compareArtist).comparer,
    sortByTitle: makeComparer(compareTitle).comparer,
    sortByRating: makeComparer(compareRating).comparer,
    sortByDuration: makeComparer(compareDuration).comparer,
    sortByReverseOrder() {
        return this.changeTrackOrderWithinSelection((tracks) => {
            tracks.reverse();
        });
    },
    sortByShuffling() {
        return this.changeTrackOrderWithinSelection((tracks) => {
            for (let i = tracks.length; i > 0; --i) {
                const index = (Math.random() * i) | 0;
                const tmp = tracks[i - 1];
                tracks[i - 1] = tracks[index];
                tracks[index] = tmp;
            }
        });
    },

    changeTrackOrderWithinSelection(callback) {
        const selectedTrackViews = this.getSelection();
        if (selectedTrackViews.length <= 1) return;

        const indices = selectedTrackViews.map(v => v.getIndex());
        callback(selectedTrackViews);

        for (let i = 0; i < selectedTrackViews.length; ++i) {
            const trackView = selectedTrackViews[i];
            const index = indices[i];
            this._trackViews[index] = trackView;
            trackView.setIndex(index);
        }
        this._selectable.updateOrder(selectedTrackViews);
        this._fixedItemListScroller.resize();
        this.edited();
        this.trackIndexChanged();
        this.emit(ITEM_ORDER_CHANGE_EVENT);
    }
};
