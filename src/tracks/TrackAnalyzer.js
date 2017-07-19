import {tracksByUid} from "tracks/Track";
import {ANALYZER_READY_EVENT_NAME} from "tracks/TrackAnalyzerBackend";
import {console} from "platform/platform";
import WorkerFrontend from "WorkerFrontend";

export default class TrackAnalyzer extends WorkerFrontend {
    constructor(deps) {
        super(ANALYZER_READY_EVENT_NAME, deps.workerWrapper);
        this._env = deps.env;
        this._page = deps.page;
        this._playlist = deps.playlist;
        this._player = deps.player;
        this._tagDataContext = deps.tagDataContext;
        this._globalEvents = deps.globalEvents;
        this._playlist.on(`unparsedTracksAvailable`, this.unparsedTracksAvailable.bind(this));
    }

    receiveMessage(event) {
        if (!event.data) return;
        const {result, error, type} = event.data;

        if (error && this._env.isDevelopment()) {
            console.error(error.stack);
        }

        if (type === `albumArtResult`) {
            this.albumArtResultReceived(result);
        } else if (type === `acoustIdDataFetched`) {
            this.acoustIdDataFetched(result);
        } else if (type === `metadataResult`) {
            this.trackMetadataParsed(result);
        }
    }

    unparsedTracksAvailable() {
        const tracks = this._playlist.getUnparsedTracks();
        for (let i = 0; i < tracks.length; ++i) {
            const track = tracks[i];

            if (!track.isDetachedFromPlaylist() && !track.hasError() && !track.tagData) {
                this.parseMetadata(track);
            }
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
            this.emit(`metadataUpdate`);
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
            this.emit(`metadataUpdate`);
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
