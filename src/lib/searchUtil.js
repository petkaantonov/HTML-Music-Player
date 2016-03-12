"use strict";

import { normalizeQuery } from "lib/util";
import sha1 from "lib/sha1";
const EMPTY_ARRAY = [];
const rext = /\.[a-zA-Z0-9_\-]+$/

export const calculateUid = function(file, metadata, useTagged) {
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

export const getSearchTerm = function(metadata, file) {
    var title = normalizeQuery(metadata.taggedTitle || metadata.title || "");
    var artist = normalizeQuery(metadata.taggedArtist || metadata.artist || "");
    var album = normalizeQuery(metadata.taggedAlbum || metadata.album || "");
    var genres = normalizeQuery((metadata.genres || EMPTY_ARRAY).join(" "));
    var albumArtist = normalizeQuery(metadata.albumArtist || "");

    if (albumArtist.length > 0 &&
        artist.length > 0 &&
        albumArtist !== artist) {
        artist += " " + albumArtist;
    }

    var ret = ((title.split(" ").concat(artist.split(" "), album.split(" "), genres.split(" "))).join(" ")).trim();

    if (!ret.length && file && typeof file.name === "string") {
        return normalizeQuery(file.name.replace(rext, ""));
    } else {
        return ret;
    }
};
