

import {normalizeQuery} from "util";
const EMPTY_ARRAY = [];
const rext = /\.[a-zA-Z0-9_-]+$/;

export const getSearchTerm = function(metadata) {
    const title = normalizeQuery(metadata.title || ``);
    let artist = normalizeQuery(metadata.artist || ``);
    const album = normalizeQuery(metadata.album || ``);
    const genres = normalizeQuery((metadata.genres || EMPTY_ARRAY).join(` `));
    const albumArtist = normalizeQuery(metadata.albumArtist || ``);

    if (albumArtist.length > 0 &&
        artist.length > 0 &&
        albumArtist !== artist) {
        artist += ` ${albumArtist}`;
    }

    return ((title.split(` `).concat(artist.split(` `), album.split(` `), genres.split(` `))).join(` `)).trim();
};
