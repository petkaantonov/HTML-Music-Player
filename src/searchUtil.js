"use strict";

const util = require("lib/util");
const sha1 = require("lib/sha1");

const calculateUid = function(file, metadata, useTagged) {
    var title, album, artist;
    if (useTagged) {
        title = metadata.taggedTitle;
        album = metadata.taggedAlbum;
        artist = metadata.taggedArtist;
    } else {
        title = metadata.title;
        album = metadata.album;
        artist = metadata.artist;
    }
    var index = metadata.albumIndex;
    var name = file.name;
    var size = file.size;
    return sha1("" + album + title + artist + index + name + size);
};

const getKeywords = function(metadata) {
    var unique = Object.create(null);
    var title = util.normalizeQuery(metadata.taggedTitle || metadata.title || "");
    var artist = util.normalizeQuery(metadata.taggedArtist || metadata.artist || "");
    var album = util.normalizeQuery(metadata.taggedAlbum || metadata.album || "");
    var genres = metadata.genres;
    if (genres) genres = util.normalizeQuery(genres.join(" "));
    var searchTerms = title.split(" ").concat(artist.split(" "), album.split(" "), genres.split(" "));
    for (var i = 0; i < searchTerms.length; ++i) {
        unique[searchTerms[i]] = true;
    }
    return Object.keys(unique);
};

const getSearchTerm = function(metadata) {
    var title = util.normalizeQuery(metadata.taggedTitle || metadata.title || "");
    var artist = util.normalizeQuery(metadata.taggedArtist || metadata.artist || "");
    var album = util.normalizeQuery(metadata.taggedAlbum || metadata.album || "");
    var genres = metadata.genres;
    if (genres) genres = util.normalizeQuery(genres.join(" "));
    return (title.split(" ").concat(artist.split(" "), album.split(" "), genres.split(" "))).join(" ");
};

const tracksByUid = Object.create(null);

exports.calculateUid = calculateUid;
exports.getKeywords = getKeywords;
exports.getSearchTerm = getSearchTerm;
