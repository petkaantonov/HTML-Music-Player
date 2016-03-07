"use strict";

const util = require("lib/util");
const searchableTracks = require("SearchableTracks");
const MAX_RESULTS = 250;

const rspace = / /g;
function TrackSearcherSessionBackend(backend, id, rawQuery, normalizedQuery) {
    this._backend = backend;
    this._id = id;
    var matchers = normalizedQuery.split(" ");
    for (var i = 0; i < matchers.length; ++i) {
        matchers[i] = new RegExp("\\b" + matchers[i] + "|" + matchers[i] + "\\b");
    }
    this._matchers = matchers;
    this._stopped = false;
    this._resultsPosted = 0;
    this._index = 0;
    this.search = this.search.bind(this);
}

TrackSearcherSessionBackend.prototype.start = function() {
    this.search();
};

TrackSearcherSessionBackend.prototype.search = function() {
    if (this._stopped || this._resultsPosted >= MAX_RESULTS) return;
    var results = [];
    var tracks = searchableTracks.getSearchableTracks();
    var tracksProcessed = 0;
    var processStarted = Date.now();
    var resultsPosted = this._resultsPosted;

    mainLoop: for (var i = this._index; i < tracks.length; ++i) {
        tracksProcessed = 0;

        while (tracksProcessed++ < 250) {
            var track = tracks[i];
            i++;
            tracksProcessed++;

            if (track.isSearchable() &&
                track.matches(this._matchers)) {
                resultsPosted++;
                results.push(track.uid());

                if (resultsPosted >= MAX_RESULTS) {
                    break mainLoop;
                }
            }

            if (i >= tracks.length) {
                break mainLoop;
            }
        }

        var elapsed = Date.now() - processStarted;

        if (elapsed > 50) {
            break mainLoop;
            setTimeout(this.search, 15);
        }
    }

    this._index = i;
    this._resultsPosted = resultsPosted;

    if (results.length > 0) {
        this._backend.newResults(this, results);
    }

    if (this._index >= tracks.length || resultsPosted >= MAX_RESULTS) {
        this._backend.stopSession(this._id);
    }
};

TrackSearcherSessionBackend.prototype.stop = function() {
    if (this._stopped) return;
    this._stopped = true;
    this._backend = null;
    this._matchers = null;
};

function TrackSearcherBackend() {
    this._sessions = {};
    this._sessionsToBeStopped = {};
}

TrackSearcherBackend.prototype.newResults = function(session, results) {
    if (this._sessions[session._id]) {
        self.postMessage({
            searchSessionId: session._id,
            type: "searchResults",
            results: results
        });
    }
};

TrackSearcherBackend.prototype.startSession = function(id, rawQuery, normalizedQuery) {
    if (this._sessionsToBeStopped[id] === true) {
        delete this._sessionsToBeStopped[id];
        return;
    }
    var session = new TrackSearcherSessionBackend(this, id, rawQuery, normalizedQuery);
    this._sessions[id] = session;
    session.start();
};

TrackSearcherBackend.prototype.stopSession = function(id) {
    var session = this._sessions[id];
    if (session) {
        session.stop();
        delete this._sessions[id];
    } else {
        this._sessionsToBeStopped[id] = true;
    }
};

module.exports = new TrackSearcherBackend();
