

import {normalizeQuery, sha1HexString} from "util";
const EMPTY_ARRAY = [];
const rext = /\.[a-zA-Z0-9_-]+$/;

export const calculateUid = function(file, metadata, useTagged) {
    let title, album, artist;
    if (useTagged) {
        title = metadata.taggedTitle || undefined;
        album = metadata.taggedAlbum || undefined;
        artist = metadata.taggedArtist || undefined;
    } else {
        title = metadata.title || undefined;
        album = metadata.album || undefined;
        artist = metadata.artist || undefined;
    }
    const {name, size} = file;
    return sha1HexString(`${album}${title}${artist}${name}${size}`);
};

export const getSearchTerm = function(metadata, file) {
    const title = normalizeQuery(metadata.taggedTitle || metadata.title || ``);
    let artist = normalizeQuery(metadata.taggedArtist || metadata.artist || ``);
    const album = normalizeQuery(metadata.taggedAlbum || metadata.album || ``);
    const genres = normalizeQuery((metadata.genres || EMPTY_ARRAY).join(` `));
    const albumArtist = normalizeQuery(metadata.albumArtist || ``);

    if (albumArtist.length > 0 &&
        artist.length > 0 &&
        albumArtist !== artist) {
        artist += ` ${albumArtist}`;
    }

    const ret = ((title.split(` `).concat(artist.split(` `), album.split(` `), genres.split(` `))).join(` `)).trim();

    if (!ret.length && file && typeof file.name === `string`) {
        return normalizeQuery(file.name.replace(rext, ``));
    } else {
        return ret;
    }
};
