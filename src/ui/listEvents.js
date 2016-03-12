"use strict"

import { TOUCH_EVENTS, doubleTapHandler, longTapHandler, modifierTapHandler, tapHandler } from "lib/DomUtil";
import { touch as touch } from "features";

exports.bindListEvents = function(contentInstance, opts) {
    opts = Object(opts);
    const dragging = !!opts.dragging;

    contentInstance.$().on("click mousedown dblclick", function(e) {
        if ($(e.target).closest(".unclickable").length > 0) return;
        if ($(e.target).closest(".track-container").length === 0) return;
        var trackView = contentInstance._fixedItemListScroller.itemByRect(e.target.getBoundingClientRect());
        if (!trackView) return;
        switch (e.type) {
            case "click": {
                if (dragging && contentInstance._draggable.recentlyStoppedDragging()) return;
                return contentInstance._selectable.trackViewClick(e, trackView);
            }
            case "mousedown": return contentInstance._selectable.trackViewMouseDown(e, trackView);
            case "dblclick": contentInstance.changeTrackExplicitly(trackView.track()); break;
        }
    });

    if (touch) {
        contentInstance.$().on(TOUCH_EVENTS, ".track-container", modifierTapHandler(function(e) {
            if ($(e.target).closest(".unclickable").length > 0) return;
            var trackView = contentInstance._fixedItemListScroller.itemByRect(e.target.getBoundingClientRect());
            if (!trackView) return;

            if (contentInstance._selectable.contains(trackView)) {
                contentInstance._selectable.removeTrackView(trackView);
            } else {
                contentInstance._selectable.addTrackView(trackView);
                contentInstance._selectable.setPriorityTrackView(trackView);
            }
        }));

        contentInstance.$().on(TOUCH_EVENTS, ".track-container", tapHandler(function(e) {
            if ($(e.target).closest(".unclickable").length > 0) return;
            var trackView = contentInstance._fixedItemListScroller.itemByRect(e.target.getBoundingClientRect());
            if (!trackView) return;
            contentInstance._selectable.selectTrackView(trackView);
        }));

        contentInstance.$().on(TOUCH_EVENTS, ".track-container", longTapHandler(function(e) {
            if ($(e.target).closest(".unclickable").length > 0) return;
            var trackView = contentInstance._fixedItemListScroller.itemByRect(e.target.getBoundingClientRect());
            if (!trackView) return;
            if (!contentInstance._selectable.contains(trackView)) {
                contentInstance._selectable.selectTrackView(trackView);
            }
            contentInstance._selectable.setPriorityTrackView(trackView);
        }));

        contentInstance.$().on(TOUCH_EVENTS, ".track-container", doubleTapHandler(function(e) {
            if ($(e.target).closest(".unclickable").length > 0) return;
            var trackView = contentInstance._fixedItemListScroller.itemByRect(e.target.getBoundingClientRect());
            if (!trackView) return;
            contentInstance.changeTrackExplicitly(trackView.track());
        }));
    }

    if (dragging) {
        contentInstance._draggable.on("dragStart", function() {
            contentInstance.$().find(".tracklist-transform-container").addClass("tracks-dragging");
        });
        contentInstance._draggable.on("dragEnd", function() {
            contentInstance.$().find(".tracklist-transform-container").removeClass("tracks-dragging");
        });
    }

};
