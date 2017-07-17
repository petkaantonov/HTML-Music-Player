import AcoustIdApiError, {ERROR_INVALID_RESPONSE_SYNTAX} from "metadata/AcoustIdApiError";

const groupTypeValue = {
    single: 0,
    album: 1
};

const getBestRecordingGroup = function(recordings) {
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
                releasegroup.type = `unknown`;
            }

            const {secondarytypes} = releasegroup;
            const type = releasegroup.type.toLowerCase();
            const typeValue = groupTypeValue[type];
            groups.push({
                indexI: i,
                indexJ: j,
                recording,
                type,
                typeValue: typeValue === undefined ? 10 : typeValue,
                album: releasegroups[j],
                secondarytypes: secondarytypes ? secondarytypes.map(v => v.toLowerCase()) : null
            });
        }
    }

    groups.sort((aGroup, bGroup) => {
        const valueDiff = aGroup.typeValue - bGroup.typeValue;

        if (valueDiff !== 0) {
            return valueDiff;
        }

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

export default function parseAcoustId(data) {
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
    let albumArtist = null;

    if (bestRecordingGroup.album) {
        album = {
            name: bestRecordingGroup.album.title,
            mbid: bestRecordingGroup.album.id,
            type: `release-group`
        };

        const isCompilation = bestRecordingGroup.secondarytypes &&
                              (`${bestRecordingGroup.secondarytypes}`).indexOf(`compilation`) >= 0;

        albumArtist = isCompilation ? {name: `Various Artists`} : album;
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
        albumArtist,
        artist
    };
}
