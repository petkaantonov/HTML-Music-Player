export default {
    _bindListEvents() {
        const {page, env, rippler} = this;

        this.$().addEventListener(`click`, page.delegatedEventHandler((e) => {
            const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
            if (!trackView) return;
            if (this._draggable && this._draggable.recentlyStoppedDragging()) return;
            if (this._selectable.trackViewClick(e, trackView) === false) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, `.track-container`));

        this.$().addEventListener(`mousedown`, page.delegatedEventHandler((e) => {
            const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
            if (!trackView) return;
            this._selectable.trackViewMouseDown(e, trackView);
        }, `.track-container`));

        this.$().addEventListener(`dblclick`, page.delegatedEventHandler((e) => {
            const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
            if (!trackView) return;
            this.changeTrackExplicitly(trackView.track());
        }, `.track-container`));

        if (env.hasTouch()) {
            this.recognizerContext.createTapRecognizer(page.delegatedEventHandler((e) => {
                const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
                if (!trackView) return;

                if (this._selectable.contains(trackView)) {
                    this._selectable.removeTrackView(trackView);
                } else {
                    this._selectable.addTrackView(trackView);
                    this._selectable.setPriorityTrackView(trackView);
                }
                rippler.rippleElement(e.delegateTarget, e.clientX, e.clientY);
            }, `.track-control-select`)).recognizeBubbledOn(this.$());

            this.recognizerContext.createTapRecognizer(page.delegatedEventHandler((e) => {
                const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
                if (!trackView) return;
                this.changeTrackExplicitly(trackView.track());
            }, `.track-data`)).recognizeBubbledOn(this.$());

            this.recognizerContext.createTapRecognizer(page.delegatedEventHandler((e) => {
                const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
                if (!trackView) return;
                rippler.rippleElement(e.delegateTarget, e.clientX, e.clientY);
                this.openSingleTrackMenu(trackView, e.delegateTarget, e);
            }, `.track-control-menu`)).recognizeBubbledOn(this.$());
        }

        if (this._draggable) {
            this._draggable.on(`dragStart`, () => {
                this.$().find(`.tracklist-transform-container`).addClass(`tracks-dragging`);
            });
            this._draggable.on(`dragEnd`, () => {
                this.$().find(`.tracklist-transform-container`).removeClass(`tracks-dragging`);
            });
        }
    },

    getSelection() {
        return this._selectable.getSelection();
    },

    clearSelection() {
        this._selectable.clearSelection();
    },

    selectAll() {
        if (this.length) {
            this._selectable.all();
        }
    },

    selectFirst() {
        if (this.length) {
            this._selectable.selectFirst();
        }
    },

    selectLast() {
        if (this.length) {
            this._selectable.selectLast();
        }
    },

    selectAllUp() {
        if (this.length) {
            this._selectable.appendPrev(this.length);
        }
    },

    selectAllDown() {
        if (this.length) {
            this._selectable.appendNext(this.length);
        }
    },

    selectPrev() {
        if (this.length) {
            this._selectable.prev();
        }
    },

    selectNext() {
        if (this.length) {
            this._selectable.next();
        }
    },

    selectPrevAppend() {
        if (this.length) {
            this._selectable.appendPrev();
        }
    },

    selectNextAppend() {
        if (this.length) {
            this._selectable.appendNext();
        }
    },

    removeTopmostSelection() {
        if (this.length) {
            this._selectable.removeTopmostSelection();
        }
    },

    removeBottommostSelection() {
        if (this.length) {
            this._selectable.removeBottommostSelection();
        }
    },

    moveSelectionUp() {
        if (this.length) {
            this._selectable.moveUp();
        }
    },

    moveSelectionDown() {
        if (this.length) {
            this._selectable.moveDown();
        }
    },

    tracksVisibleInContainer() {
        return this._fixedItemListScroller.itemsVisibleInContainer();
    },

    halfOfTracksVisibleInContainer() {
        return Math.ceil(this.tracksVisibleInContainer() / 2);
    },

    selectPagePrevAppend() {
        if (this.length) {
            this._selectable.appendPrev(this.halfOfTracksVisibleInContainer());
        }
    },

    selectPageNextAppend() {
        if (this.length) {
            this._selectable.appendNext(this.halfOfTracksVisibleInContainer());
        }
    },

    selectPagePrev() {
        if (this.length) {
            this._selectable.prev(this.halfOfTracksVisibleInContainer());
        }
    },

    selectPageNext() {
        if (this.length) {
            this._selectable.next(this.halfOfTracksVisibleInContainer());
        }
    },

    removeTopmostPageSelection() {
        if (this.length) {
            this._selectable.removeTopmostSelection(this.halfOfTracksVisibleInContainer());
        }
    },

    removeBottommostPageSelection() {
        if (this.length) {
            this._selectable.removeBottommostSelection(this.halfOfTracksVisibleInContainer());
        }
    },

    moveSelectionPageUp() {
        if (this.length) {
            this._selectable.moveUp(this.halfOfTracksVisibleInContainer());
        }
    },

    moveSelectionPageDown() {
        if (this.length) {
            this._selectable.moveDown(this.halfOfTracksVisibleInContainer());
        }
    },

    selectTrackView(trackView) {
        const index = trackView.getIndex();
        if (index >= 0) {
            this.clearSelection();
            this._selectable.addTrackView(trackView);
            this.centerOnTrackView(trackView);
        }
    },

    selectionContainsAnyItemViewsBetween(startY, endY) {
        const indices = this._fixedItemListScroller.coordsToIndexRange(startY, endY);
        if (!indices) return false;
        return this._selectable.containsAnyInRange(indices.startIndex, indices.endIndex);
    },

    selectTracksBetween(startY, endY) {
        const indices = this._fixedItemListScroller.coordsToIndexRange(startY, endY);
        if (!indices) return;
        this._selectable.selectRange(indices.startIndex, indices.endIndex);
    },

    getItemHeight() {
        return this._fixedItemListScroller.itemHeight();
    },

    playPrioritySelection() {
        if (!this.length) return;

        const trackView = this._selectable.getPriorityTrackView();
        if (!trackView) {
            this.playFirstSelected();
            return;
        }
        this.changeTrackExplicitly(trackView.track());
    },

    playFirstSelected() {
        if (!this.length) return;

        const firstTrackView = this._selectable.first();
        if (!firstTrackView) return;
        this.changeTrackExplicitly(firstTrackView.track());
    },

    getTrackViews() {
        return this._trackViews;
    },

    centerOnTrackView(trackView) {
        if (trackView && !trackView.isDetachedFromPlaylist()) {
            let y = this._fixedItemListScroller.yByIndex(trackView.getIndex());
            y -= (this._fixedItemListScroller.contentHeight() / 2);
            this._fixedItemListScroller.scrollToUnsnapped(y, false);
        }
    },

    getTrackByIndex(index) {
        if (index >= 0 && index <= this._trackViews.length - 1) {
            return this._trackViews[index].track();
        }
        return null;
    },

    getTrackViewByIndex(index) {
        if (index >= 0 && index <= this._trackViews.length - 1) {
            return this._trackViews[index];
        }
        return null;
    },

    getSelectable() {
        return this._selectable;
    },

    getSelectedItemViewCount() {
        return this._selectable.getSelectedItemViewCount();
    },

    isSelected(trackView) {
        return this._selectable.contains(trackView);
    },

    toArray() {
        return this._trackViews.slice();
    },

    removeTracksBySelectionRanges: (function() {
        function remove(trackViews, selection, indexOffset) {
            const trackViewsLength = trackViews.length;
            const tracksToRemove = selection.length;
            const count = trackViewsLength - tracksToRemove;
            const index = selection[0] - indexOffset;

            for (let i = index; i < count && i + tracksToRemove < trackViewsLength; ++i) {
                const trackView = trackViews[i + tracksToRemove];
                trackView.setIndex(i);
                trackViews[i] = trackView;
            }
            trackViews.length = count;
        }

        return function(selectionRanges) {
            const trackViews = this._trackViews;
            let indexOffset = 0;
            selectionRanges.forEach((selection) => {
                remove(trackViews, selection, indexOffset);
                indexOffset += selection.length;
            });
        };
    }())
};
