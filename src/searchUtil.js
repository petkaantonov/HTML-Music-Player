"use strict";

const util = require("lib/util");
const sha1 = require("lib/sha1");
const EMPTY_ARRAY = [];
const rext = /\.[a-zA-Z0-9_\-]+$/

const calculateUid = function(file, metadata, useTagged) {
    var title, album, artist;
    if (useTagged) {
        title = metadata.taggedTitle || undefined;
        album = metadata.taggedAlbum || undefined;
        artist = metadata.taggedArtist || undefined;
    } else {
        title = metadata.title || undefined;
        album = metadata.album || undefined;
        artist = metadata.artist || undefined;
    }
    var name = file.name;
    var size = file.size;
    return sha1("" + album + title + artist + name + size);
};

const getSearchTerm = function(metadata, file) {
    var title = util.normalizeQuery(metadata.taggedTitle || metadata.title || "");
    var artist = util.normalizeQuery(metadata.taggedArtist || metadata.artist || "");
    var album = util.normalizeQuery(metadata.taggedAlbum || metadata.album || "");
    var genres = util.normalizeQuery((metadata.genres || EMPTY_ARRAY).join(" "));
    var albumArtist = util.normalizeQuery(metadata.albumArtist || "");

    if (albumArtist.length > 0 &&
        artist.length > 0 &&
        albumArtist !== artist) {
        artist += " " + albumArtist;
    }

    var ret = ((title.split(" ").concat(artist.split(" "), album.split(" "), genres.split(" "))).join(" ")).trim();

    if (!ret.length && file && typeof file.name === "string") {
        return util.normalizeQuery(file.name.replace(rext, ""));
    } else {
        return ret;
    }
};

const tracksByUid = Object.create(null);

exports.calculateUid = calculateUid;
exports.getSearchTerm = getSearchTerm;
