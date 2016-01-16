"use strict";
const $ = require("../lib/jquery");
const EventEmitter = require("events");
const util = require("./util");

function highlight(string, matchedCodePoints, tagStart, tagEnd) {
    if (!tagStart) tagStart = '<strong>';
    if (!tagEnd) tagEnd = '</strong>';
    var lowerCaseString = string.toLowerCase();

    if (lowerCaseString.length !== string.length) {
        // TODO: Implement.
        return string;
    }

    var ret = [];
    var currentIndex = 0;
    var i = 0;
    while (i < matchedCodePoints.length) {
        var start = util.indexOfCodePoint(lowerCaseString, matchedCodePoints[i], currentIndex);
        var end = start;

        for (var j = i + 1, k = start + 1; j < matchedCodePoints.length; ++j, ++k) {
            if (lowerCaseString.charCodeAt(k) === matchedCodePoints[j]) {
                end = k;
            } else {
                break;
            }
        }

        if (start === currentIndex) {
            ret.push(tagStart, string.slice(start, end + 1), tagEnd);
        } else {
            ret.push(string.slice(currentIndex, start), tagStart, string.slice(start, end + 1), tagEnd);
        }
        currentIndex = k;
        i = j;
    }
    if (currentIndex < string.length - 1) {
        ret.push(string.slice(currentIndex));
    }
    return ret.join("");
}

function TrackSearchResult(track, index, trackSearcher) {
    this.track = track;
    this.index = index;
    this.trackSearcher = trackSearcher;
    this._domNode = this._createDom();
}

TrackSearchResult.prototype._createDom = function() {
    return $("<div class='track-searcher-result ui-text notextflow'></div>");
};

TrackSearchResult.prototype.$ = function() {
    return this._domNode;
};

TrackSearchResult.prototype.getIndex = function() {
    return this.index;
};

TrackSearchResult.prototype.unselect = function() {
    this.$().removeClass("selected");
};

TrackSearchResult.prototype.select = function() {
    this.$().addClass("selected");
};

TrackSearchResult.prototype.remove = function() {
    this.$().remove();
};

TrackSearchResult.prototype.attach = function($parent) {
    var self = this;
    var highlighted = highlight(this.track.formatName(),
                              this.trackSearcher._currentQueryComponents,
                              "\x01",
                              "\x02");
    highlighted = highlighted.htmlEncode()
                        .replace(/\x01/g, "<strong>")
                        .replace(/\x02/g, "</strong>");
    this.$().html(highlighted);
    $parent.append(this.$());
    this.$().on("click", function() {
        self.trackSearcher.selectResult(self);
    });
};

function TrackSearcher(playlist, domNode) {
    EventEmitter.call(this);
    this._playlist = playlist;
    this._currentResult = null;
    this._results = [];
    this._domNode = $(domNode);
    this._onKeyDown = $.proxy(this._onKeyDown, this);
    this._onInput = $.proxy(this._onInput, this);
    this._destroyed = false;
    this._currentQueryComponents = [];

    this.$().html("<input type='text' spellcheck='false' autocomplete='off' " +
        "class='track-searcher-input app-bread-text app-popup-input'>" +
        "<div class='track-searcher-header'>Results</div>" +
        "<div class='track-searcher-results'></div>");

    this.input().on("keydown", this._onKeyDown);
    this.input().on("input", this._onInput);
}
util.inherits(TrackSearcher, EventEmitter);

var MAX_RESULTS = 50;
var MAX_LETTER_DISTANCE = 25;

function queryComponents(query) {
    return [].map.call(query.replace(util.unicode.alphaNumericFilteringPattern, "")
            .toLowerCase(), toCharCode);
}

function toCharCode(v) {
    return v.charCodeAt(0);
}

function search(components, tracks) {
    if (!components.length) return [];
    var results = [];

    for (var i = 0; i < tracks.length; ++i) {
        var track = tracks[i];
        var searchString = track.getSearchString();
        if (!searchString.length) continue;

        var previousIndex = -1;
        var mostConsecutiveLetters = 0;
        var mostConsecutiveLettersCount = 0;
        var mostConsecutiveLettersMatchIndex = -1;
        var currentConsecutiveLetters = 0;
        var currentLetterIndex = 0;


        componentLoop: for (var j = 0; j < components.length; ++j) {
            var component = components[j];

            for (var k = currentLetterIndex; k < searchString.length; ++k) {
                var letter = searchString.charCodeAt(k);

                if (letter === component) {
                    if (previousIndex >= 0 && previousIndex === k - 1) {
                        currentConsecutiveLetters++;
                    } else if (currentConsecutiveLetters > 0) {
                        if (mostConsecutiveLetters === currentConsecutiveLetters) {
                            mostConsecutiveLettersCount++;
                        } else if (currentConsecutiveLetters > mostConsecutiveLetters) {
                            mostConsecutiveLettersCount = 1;
                            mostConsecutiveLetters = currentConsecutiveLetters;
                            mostConsecutiveLettersMatchIndex = k;
                        }
                        currentConsecutiveLetters = 0;
                    }
                    previousIndex = k;
                    currentLetterIndex = k + 1;
                    continue componentLoop;
                }
            }
            break componentLoop;
        }

        if (mostConsecutiveLetters === currentConsecutiveLetters) {
            mostConsecutiveLettersCount++;
        } else if (currentConsecutiveLetters > mostConsecutiveLetters) {
            mostConsecutiveLetters = currentConsecutiveLetters;
            mostConsecutiveLettersCount = 1;
            mostConsecutiveLettersMatchIndex = k;
        }

        if (j === components.length) {
            results.push({
                track: track,
                mostConsecutiveLetters: mostConsecutiveLetters,
                mostConsecutiveLettersCount: mostConsecutiveLettersCount,
                mostConsecutiveLettersMatchIndex: mostConsecutiveLettersMatchIndex
            });
        }
    }

    return results.sort(function(a, b) {
        var comparison;

        if ((comparison = b.mostConsecutiveLetters - a.mostConsecutiveLetters) !== 0) {
            return comparison;
        }

        if ((comparison = b.mostConsecutiveLettersCount - a.mostConsecutiveLettersCount) !== 0) {
            return comparison;
        }

        if ((comparison = a.mostConsecutiveLettersMatchIndex - b.mostConsecutiveLettersMatchIndex) !== 0) {
            return comparison;
        }

        return a.track.formatName().localeCompare(b.track.formatName());
    }).slice(0, MAX_RESULTS);
}

TrackSearcher.prototype._onKeyDown = function(e) {
    switch(e.which) {
        case 38:
            e.preventDefault();
            this.moveToPrev();
            break;
        case 40:
            e.preventDefault();
            this.moveToNext();
            break;
        case 13:
            e.preventDefault();
            this.selectResult(this._currentResult);
            break;
        case 27:
            e.preventDefault();
            this.destroy();
            break;
    }
};

TrackSearcher.prototype._onInput = function(e) {
    this.search();
};

TrackSearcher.prototype.destroy = function() {
    if (this._destroyed) return;
    this._results = null;
    this.$().remove();
    this.emit("destroy");
};

TrackSearcher.prototype.moveToNext = function() {
    var index = this._currentResult ? this._currentResult.getIndex() + 1 : 0;
    index = Math.min(this.length() - 1, Math.max(0, index));
    this.setCurrentResult(this._results[index]);
};

TrackSearcher.prototype.moveToPrev = function() {
    var index = this._currentResult ? this._currentResult.getIndex() - 1 : 0;
    index = Math.min(this.length() - 1, Math.max(0, index));
    this.setCurrentResult(this._results[index]);
};

TrackSearcher.prototype.setCurrentResult = function(result) {
    if (this._currentResult) this._currentResult.unselect();
    this._currentResult = result;
    if (result) {
        result.select();
        util.scrollIntoView.alignMiddle(result.$()[0], result.$().parent()[0]);
    }
};

TrackSearcher.prototype.selectResult = function(result) {
    if (result) {
        this.destroy();
        this._playlist.changeTrackExplicitly(result.track);
        this._playlist.centerOnTrack(result.track);
    }
};

TrackSearcher.prototype.search = function() {
    var value = this.input().val();
    var components = queryComponents(value);

    if (util.arrayEquals(components, this._currentQueryComponents)) {
        return;
    }
    this.setCurrentResult(null);

    this._results.forEach(function(result) {
        result.remove();
    });
    this._currentQueryComponents = components;
    this._results = search(components, this._playlist.getTracks()).map(function(v, i) {
        return new TrackSearchResult(v.track, i, this);
    }, this);

    if (this._results.length) {
        var $parent = this.$().find(".track-searcher-results");
        this._results.forEach(function(result) {
            result.attach($parent);
        }, this);
        this.moveToNext();
    }
};

TrackSearcher.prototype.length = function() {
    return this._results.length;
};

TrackSearcher.prototype.input = function() {
    return this.$().find(".track-searcher-input");
};

TrackSearcher.prototype.$ = function() {
    return this._domNode;
};

module.exports = TrackSearcher;
