import {tracksByUid} from "tracks/Track";
import {METADATA_MANAGER_READY_EVENT_NAME,
            ALBUM_ART_RESULT_MESSAGE,
            ACOUST_ID_DATA_RESULT_MESSAGE,
            METADATA_RESULT_MESSAGE} from "metadata/MetadataManagerBackend";
import WorkerFrontend from "WorkerFrontend";

export default class MetadataManagerFrontend extends WorkerFrontend {
    constructor(deps) {
        super(METADATA_MANAGER_READY_EVENT_NAME, deps.workerWrapper);
        this._env = deps.env;
        this._tagDataContext = deps.tagDataContext;
    }

    receiveMessage(event) {
        if (!event.data) return;
        const {result, type} = event.data;

        if (type === ALBUM_ART_RESULT_MESSAGE) {
            this.albumArtResultReceived(result);
        } else if (type === ACOUST_ID_DATA_RESULT_MESSAGE) {
            this.acoustIdDataFetched(result);
        } else if (type === METADATA_RESULT_MESSAGE) {
            this.trackMetadataParsed(result);
        }
    }

    albumArtResultReceived(albumArtResult) {
        const {trackUid, albumArt, requestReason} = albumArtResult;

        const tracks = tracksByUid(trackUid);
        if (!tracks.length) {
            return;
        }

        if (albumArt) {
            this.emit(`albumArt`, trackUid, albumArt, requestReason);
        }
    }

    acoustIdDataFetched(acoustIdResult) {
        const {trackInfo, trackInfoUpdated} = acoustIdResult;
        const {trackUid} = trackInfo;

        const tracks = tracksByUid(trackUid);
        if (!tracks.length) {
            return;
        }

        if (trackInfoUpdated) {
            for (const track of tracks) {
                track.tagData.updateFields(trackInfo);
                track.tagDataUpdated();
            }
            this.emit(`metadataUpdate`, tracks);
        }
    }

    trackMetadataParsed(metadataResult) {
        const {trackInfo, trackUid, error} = metadataResult;

        const tracks = tracksByUid(trackUid);
        if (!tracks.length) {
            return;
        }

        for (const track of tracks) {
            if (error) {
                track.setError(error && error.message || `${error}`);
            } else {
                const tagData = this._tagDataContext.create(track, trackInfo);
                track.setTagData(tagData);
            }
        }

        if (!error) {
            this.emit(`metadataUpdate`, tracks);
        }
    }

    async getAlbumArt(track, {artist, album, preference, requestReason}) {
        const trackUid = await track.uid();
        this.postMessage({
            action: `getAlbumArt`,
            args: {trackUid, artist, album, preference, requestReason}
        });
    }

    async parseMetadata(track) {
        if (!track.needsParsing()) {
            return;
        }
        const uid = await track.uid();
        this.postMessage({
            action: `parseMetadata`,
            args: {
                uid,
                file: track.getFile()
            }
        });
    }
}
