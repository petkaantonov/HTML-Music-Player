import { Track } from "metadata/MetadataManagerFrontend";
import TrackContainerController from "tracks/TrackContainerController";

import TrackView from "./TrackView";

const compareAlbum = function (a: Track, b: Track) {
    return `${a.getAlbumForSort()}`.localeCompare(`${b.getAlbumForSort()}`);
};

const compareAlbumIndex = function (a: Track, b: Track) {
    return a.getAlbumIndexForSort() - b.getAlbumIndexForSort();
};

const compareDiscNumber = function (a: Track, b: Track) {
    return a.getDiscNumberForSort() - b.getDiscNumberForSort();
};

const compareTitle = function (a: Track, b: Track) {
    return `${a.getTitleForSort()}`.localeCompare(`${b.getTitleForSort()}`);
};

const compareAlbumArtist = function (a: Track, b: Track) {
    return `${a.getAlbumArtistForSort()}`.localeCompare(`${b.getAlbumArtistForSort()}`);
};

const compareArtist = function (a: Track, b: Track) {
    return `${a.getArtistForSort()}`.localeCompare(`${b.getArtistForSort()}`);
};

const compareDuration = function (a: Track, b: Track) {
    return a.duration - b.duration;
};

const compareRating = function (a: Track, b: Track) {
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
    compareDuration,
];

const makeComparer = function (
    mainComparer: (a: Track, b: Track) => number
): {
    comparer: Comparer;
} {
    const comparers = compareOrder.slice(0);
    comparers.splice(comparers.indexOf(mainComparer), 1);
    const { length } = comparers;

    const comparer = function (aTrackView: TrackView, bTrackView: TrackView) {
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
            const theComparer = comparers[i]!;
            if ((comparison = theComparer(aTrack, bTrack)) !== 0) {
                return comparison;
            }
        }

        return aTrack.formatName().localeCompare(bTrack.formatName());
    };

    const sorter = function (tracks: TrackView[]) {
        tracks.sort(comparer);
    };

    return {
        comparer() {
            return this.changeTrackOrderWithinSelection(sorter);
        },
    };
};

type ThisType = TrackSorterTrait & TrackContainerController<any>;
type Comparer = (this: ThisType) => void;
type Callback = (tracks: TrackView[]) => void;

export interface TrackSorterTrait {
    sortByAlbum: Comparer;
    sortByAlbumArtist: Comparer;
    sortByArtist: Comparer;
    sortByTitle: Comparer;
    sortByRating: Comparer;
    sortByDuration: Comparer;
    sortByReverseOrder: Comparer;
    sortByShuffling: Comparer;
    changeTrackOrderWithinSelection: (fn: Callback) => void;
}

const ret: TrackSorterTrait = {
    sortByAlbum: makeComparer(compareAlbum).comparer,
    sortByAlbumArtist: makeComparer(compareAlbumArtist).comparer,
    sortByArtist: makeComparer(compareArtist).comparer,
    sortByTitle: makeComparer(compareTitle).comparer,
    sortByRating: makeComparer(compareRating).comparer,
    sortByDuration: makeComparer(compareDuration).comparer,
    sortByReverseOrder() {
        return this.changeTrackOrderWithinSelection(tracks => {
            tracks.reverse();
        });
    },
    sortByShuffling() {
        return this.changeTrackOrderWithinSelection(tracks => {
            for (let i = tracks.length; i > 0; --i) {
                const index = (Math.random() * i) | 0;
                const tmp = tracks[i - 1]!;
                tracks[i - 1] = tracks[index]!;
                tracks[index] = tmp;
            }
        });
    },

    changeTrackOrderWithinSelection(this: ThisType, callback) {
        const selectedTrackViews = this.getSelection();
        if (selectedTrackViews.length <= 1) return;

        const indices = selectedTrackViews.map(v => v.getIndex());
        callback(selectedTrackViews);

        for (let i = 0; i < selectedTrackViews.length; ++i) {
            const trackView = selectedTrackViews[i]!;
            const index = indices[i]!;
            this._trackViews[index] = trackView;
            trackView.setIndex(index);
        }
        this._selectable.updateOrder(selectedTrackViews);
        this._fixedItemListScroller.resize();
        this.edited();
        this.trackIndexChanged();
        this.emit("itemOrderChanged");
    },
};
export default ret;

export interface TrackSorterEventsMap {
    itemOrderChanged: () => void;
}
