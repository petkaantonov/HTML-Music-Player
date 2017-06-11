import {XMLHttpRequest} from "platform/platform";
import AcoustIdApiError, {ERROR_TIMEOUT, ERROR_INVALID_RESPONSE_SYNTAX} from "audio/AcoustIdApiError";
import {queryString} from "util";

const getBestRecordingGroup = function(recordings) {
    recordings.reverse();
    const groups = [];

    for (let i = 0; i < recordings.length; ++i) {
        const recording = recordings[i];
        if (!recording || !recording.releasegroups) {
            continue;
        }
        const {releasegroups} = recording;
        if (!releasegroups) {
            continue;
        }
        for (let j = 0; j < releasegroups.length; ++j) {
            const releasegroup = releasegroups[j];
            if (!releasegroup) {
                continue;
            }

            if (!releasegroup.type) {
                releasegroup.type = `crap`;
            }

            const {secondarytypes} = releasegroup;
            groups.push({
                indexI: i,
                indexJ: j,
                recording,
                type: releasegroup.type.toLowerCase(),
                album: releasegroups[j],
                secondarytypes: secondarytypes ? secondarytypes.map(v => v.toLowerCase()) : null
            });
        }
    }

    groups.sort((aGroup, bGroup) => {
        if (aGroup.type === `album` && bGroup.type === `album`) {
            const aSec = aGroup.secondarytypes;
            const bSec = bGroup.secondarytypes;

            if (aSec && bSec) {
                const aCompilation = aSec.indexOf(`compilation`) >= 0;
                const bCompilation = bSec.indexOf(`compilation`) >= 0;

                if (aCompilation && bCompilation) {
                    const diff = aGroup.indexI - bGroup.indexI;
                    if (diff !== 0) return diff;
                    return aGroup.indexJ - bGroup.indexJ;
                } else if (aCompilation && !bCompilation) {
                    return 1;
                } else if (!aCompilation && bCompilation) {
                    return -1;
                } else {
                    const diff = aGroup.indexI - bGroup.indexI;
                    if (diff !== 0) return diff;
                    return aGroup.indexJ - bGroup.indexJ;
                }
            } else if (aSec && !bSec) {
                return 1;
            } else if (!aSec && bSec) {
                return -1;
            } else {
                const diff = aGroup.indexI - bGroup.indexI;
                if (diff !== 0) return diff;
                return aGroup.indexJ - bGroup.indexJ;
            }
        } else if (aGroup.type === `album`) {
            return -1;
        } else {
            return 1;
        }
    });

    if (!groups.length) {
        return {
            recording: recordings[0],
            album: null
        };
    }

    return groups[0];
};

const formatArtist = function(artists) {
    if (artists.length === 1) {
        return artists[0].name;
    } else {
        let ret = ``;
        let i = 0;
        for (; i < artists.length - 1; ++i) {
            ret += artists[i].name + artists[i].joinphrase;
        }
        ret += artists[i].name;
        return ret;
    }
};

const parseAcoustId = function(data) {
    if (!data) {
        throw new AcoustIdApiError(`syntax error`, ERROR_INVALID_RESPONSE_SYNTAX);
    }

    if (data.status === `error`) {
        throw new AcoustIdApiError(data.error.message, data.error.code);
    }

    const result = data.results && data.results[0] || null;

    if (!result) return null;
    if (!result.recordings || result.recordings.length === 0) return null;
    const bestRecordingGroup = getBestRecordingGroup(result.recordings);
    if (!bestRecordingGroup) return null;
    const {recording} = bestRecordingGroup;

    const title = {
        name: recording.title,
        mbid: recording.id,
        type: `release`
    };
    let album = null;

    if (bestRecordingGroup.album) {
        album = {
            name: bestRecordingGroup.album.title,
            mbid: bestRecordingGroup.album.id,
            type: `release-group`
        };
    }

    let artist = null;
    if (recording.artists && recording.artists.length) {
        artist = {
            name: formatArtist(recording.artists),
            mbid: recording.artists[0].id,
            type: `artist`
        };
    }

    return {
        title,
        album,
        artist
    };
};

function ajaxGet(url) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.timeout = 5000;

        function error() {
            reject(new AcoustIdApiError(`request timed out`, ERROR_TIMEOUT));
        }

        xhr.addEventListener(`load`, () => {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch (e) {
              reject(e);
            }
        }, false);

        xhr.addEventListener(`abort`, error);
        xhr.addEventListener(`timeout`, error);
        xhr.addEventListener(`error`, () => {
            reject(new AcoustIdApiError(`Response status: ${xhr.status}`, ERROR_INVALID_RESPONSE_SYNTAX));
        });

        xhr.open(`GET`, url);
        xhr.send(null);
    });
}

export const fetchAcoustId = async function(db, uid, fingerprint, duration) {
    const data = queryString({
        client: `djbbrJFK`,
        format: `json`,
        duration: duration | 0,
        meta: `recordings+releasegroups+compress`,
        fingerprint
    });

    let result;
    let retries = 0;
    while (retries < 5) {
        try {
            const response = await ajaxGet(`https://api.acoustId.org/v2/lookup?${data}`);
            result = parseAcoustId(response);
            break;
        } catch (e) {
            if (!e.isRetryable()) {
                throw e;
            }
            retries++;
        }
    }
    db.updateAcoustId(uid, result);
    return result;
};

const imageFetchQueue = [];
let currentImageFetch = false;

const actualFetchImage = async function(db, acoustId, albumKey) {
    const image = await db.getAlbumImage(albumKey);
    if (image) return image;

    if (acoustId && acoustId.album) {
        const {type, mbid} = acoustId.album;
        const url = `https://coverartarchive.org/${type}/${mbid}/front-250`;
        const ret = {url};
        db.setAlbumImage(albumKey, url);
        return ret;
    } else {
        return null;
    }
};

const next = function() {
    if (imageFetchQueue.length > 0) {
        const {db, acoustId, albumKey, resolve} = imageFetchQueue.shift();
        resolve(actualFetchImage(db, acoustId, albumKey));
    } else {
        currentImageFetch = false;
    }
};
export const fetchAcoustIdImage = function(db, acoustId, albumKey) {
    return (async () => {
        try {
            await new Promise((resolve) => {
                if (!currentImageFetch) {
                    currentImageFetch = true;
                    resolve(actualFetchImage(db, acoustId, albumKey));
                } else {
                    imageFetchQueue.push({
                        acoustId,
                        albumKey,
                        resolve,
                        db
                    });
                }
            });
        } finally {
            next();
        }
    })();
};
