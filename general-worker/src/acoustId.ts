import * as io from "io-ts";
import { AcoustIdApiError, AcoustIdErrorCode, ERROR_INVALID_RESPONSE_SYNTAX } from "shared/errors";

const groupTypeValue = {
    single: 0,
    album: 1,
    ep: 2,
    broadcast: 3,
    other: 4,
    unknown: undefined,
};
const GroupType = io.keyof(groupTypeValue);
type GroupType = io.TypeOf<typeof GroupType>;

const secondaryTypeWeight = {
    none: 0,
    soundtrack: 1,
    compilation: 2,
    remix: 3,
    "dj-mix": 4,
    spokenword: 5,
    interview: 6,
    audiobook: 7,
    live: 8,
    "mixtape/street": 9,
};
const SecondaryType = io.keyof(secondaryTypeWeight);
type SecondaryType = io.TypeOf<typeof SecondaryType>;

const getSecondaryTypeWeight = function (secondarytypes?: string[]) {
    if (!secondarytypes || !secondarytypes.length) {
        return -1;
    }
    let lowestWeight = Math.pow(2, 31);
    for (const secondarytype of secondarytypes) {
        const key = `${secondarytype}`.toLowerCase();
        // eslint-disable-next-line no-prototype-builtins
        if (secondaryTypeWeight.hasOwnProperty(key)) {
            lowestWeight = Math.min(secondaryTypeWeight[key as SecondaryType], lowestWeight);
        }
    }

    if (lowestWeight === Math.pow(2, 31)) {
        return secondaryTypeWeight.none;
    }
    return lowestWeight;
};

interface Recording {
    releasegroups?: ReleaseGroup[];
    duration?: number;
    title?: string;
    artists?: Artist[];
    id: string;
}

interface ReleaseGroup {
    type?: string;
    secondarytypes?: SecondaryType[];
    title: string;
    id: string;
}

interface RecordingGroup {
    indexI: number;
    indexJ: number;
    recording: Recording;
    type: GroupType;
    typeValue: number;
    album: ReleaseGroup;
    secondaryTypeWeight: number;
    durationDiff: number;
}

const getBestRecordingGroup = function (recordings: Recording[], actualDuration: number) {
    const groups: RecordingGroup[] = [];

    for (let i = 0; i < recordings.length; ++i) {
        const recording = recordings[i];
        if (!recording || !recording.releasegroups) {
            continue;
        }
        const { releasegroups } = recording;
        if (!releasegroups) {
            continue;
        }

        if (
            !recording.duration ||
            !isFinite(recording.duration) ||
            Math.abs(recording.duration - actualDuration) > 20
        ) {
            continue;
        }

        const durationDiff = Math.abs(recording.duration - actualDuration);

        for (let j = 0; j < releasegroups.length; ++j) {
            const releasegroup = releasegroups[j];
            if (!releasegroup) {
                continue;
            }

            if (!releasegroup.type) {
                releasegroup.type = `unknown`;
            }

            const { secondarytypes } = releasegroup;
            const type = releasegroup.type.toLowerCase() as GroupType;
            const typeValue = groupTypeValue[type];

            groups.push({
                indexI: i,
                indexJ: j,
                recording,
                type,
                typeValue: typeValue === undefined ? 10 : typeValue,
                album: releasegroups[j]!,
                secondaryTypeWeight: getSecondaryTypeWeight(secondarytypes),
                durationDiff,
            });
        }
    }

    groups.sort((aGroup, bGroup) => {
        let valueDiff = aGroup.typeValue - bGroup.typeValue;

        if (valueDiff !== 0) {
            return valueDiff;
        }

        valueDiff = aGroup.secondaryTypeWeight - bGroup.secondaryTypeWeight;

        if (valueDiff !== 0) {
            return valueDiff;
        }

        valueDiff = aGroup.durationDiff - bGroup.durationDiff;

        if (valueDiff !== 0) {
            return valueDiff;
        }

        valueDiff = aGroup.indexI - bGroup.indexI;

        if (valueDiff !== 0) {
            return valueDiff;
        }

        return aGroup.indexJ - bGroup.indexJ;
    });

    if (!groups.length) {
        return {
            recording: recordings[0],
            album: null,
        };
    }

    return groups[0];
};

interface Artist {
    name: string;
    joinphrase: string;
    id: string;
}

const formatArtist = function (artists: Artist[]) {
    if (artists.length === 1) {
        return artists[0]!.name;
    } else {
        let ret = ``;
        let i = 0;
        for (; i < artists.length - 1; ++i) {
            ret += artists[i]!.name + artists[i]!.joinphrase;
        }
        ret += artists[i]!.name;
        return ret;
    }
};

interface AcoustIdResult {
    score: number;
    recordings?: Recording[];
}

interface BaseResponse {
    status?: "error";
    error?: {
        message: string;
        code: AcoustIdErrorCode;
    };
}

export interface AcoustIdResponse extends BaseResponse {
    results?: AcoustIdResult[];
}

export interface CoverArtImage {
    name: "wtf";
}

export interface CoverArtResponse extends BaseResponse {
    images?: CoverArtImage[];
}
export type ParsedAcoustIdResult = ReturnType<typeof parseAcoustId>;
export default function parseAcoustId(data: AcoustIdResponse | null, actualDuration: number) {
    if (!data) {
        throw new AcoustIdApiError(`syntax error`, ERROR_INVALID_RESPONSE_SYNTAX);
    }

    if (data.status === `error`) {
        if (data.error) {
            throw new AcoustIdApiError(data.error.message, data.error.code);
        } else {
            throw new AcoustIdApiError(`syntax error`, ERROR_INVALID_RESPONSE_SYNTAX);
        }
    }

    const { results } = data;

    if (!results || results.length === 0) {
        return null;
    }

    let bestRecordingGroup;
    for (const result of results) {
        if (result.score < 0.7 || !result.recordings || !result.recordings.length) {
            continue;
        }
        bestRecordingGroup = getBestRecordingGroup(result.recordings, actualDuration);
        if (!bestRecordingGroup) {
            continue;
        }

        const { recording } = bestRecordingGroup;
        if (!recording || !recording.title || !recording.artists) {
            continue;
        }

        break;
    }

    if (!bestRecordingGroup || !bestRecordingGroup.recording) {
        return null;
    }

    const { recording } = bestRecordingGroup;

    const title = {
        name: recording.title,
        mbid: recording.id,
        type: `release`,
    };
    let album = null;
    let albumArtist = null;

    let artist = null;
    if (recording.artists && recording.artists.length) {
        artist = {
            name: formatArtist(recording.artists),
            mbid: recording.artists[0]!.id,
            type: `artist`,
        };
    }

    if (bestRecordingGroup.album) {
        album = {
            name: bestRecordingGroup.album.title,
            mbid: bestRecordingGroup.album.id,
            type: `release-group`,
        };

        const isCompilation =
            bestRecordingGroup.album.secondarytypes &&
            `${bestRecordingGroup.album.secondarytypes}`.indexOf(`compilation`) >= 0;

        albumArtist = isCompilation ? { name: `Various Artists` } : artist;
    }

    return {
        title,
        album,
        albumArtist,
        artist,
    };
}
