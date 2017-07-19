import AbstractBackend from "AbstractBackend";
import JobProcessor from "utils/JobProcessor";
import {delay} from "util";
import FileView from "platform/FileView";
import getCodec from "audio/backend/codec";
import {allocResampler, freeResampler} from "audio/backend/pool";
import ChannelMixer from "audio/backend/ChannelMixer";
import AudioProcessingPipeline from "audio/backend/AudioProcessingPipeline";
import Fingerprinter from "audio/backend/Fingerprinter";
import {MAX_BUFFER_LENGTH_SECONDS as MAXIMUM_BUFFER_TIME_SECONDS} from "audio/frontend/buffering";

const BUFFER_DURATION = MAXIMUM_BUFFER_TIME_SECONDS;
export const JOB_STATE_INITIAL = `initial`;
export const JOB_STATE_DATA_FETCHED = `dataFetched`;
export const ANALYZER_READY_EVENT_NAME = `analyzerReady`;

export default class TrackAnalyzerBackend extends AbstractBackend {
    constructor(wasm, db, metadataManager, timers) {
        super(ANALYZER_READY_EVENT_NAME);
        this.db = db;
        this.timers = timers;
        this.metadataManager = metadataManager;
        this.wasm = wasm;

        this.acoustIdDataFetcher = new JobProcessor({delay: 1000, jobCallback: this.fetchAcoustIdData.bind(this)});
        this.analyzer = new JobProcessor({jobCallback: this.analyze.bind(this)});
        this.actions = {
            async getAlbumArt({trackUid, artist, album, preference, requestReason}) {
                const albumArt = await this.metadataManager.getAlbumArt(trackUid, artist, album, preference);
                const result = {albumArt, trackUid, preference, requestReason};
                this.postMessage({type: `albumArtResult`, result});
            },

            async parseMetadata({file, uid}) {
                try {
                    const trackInfo = await this.metadataManager.parseAudioFileMetadata(file, uid);
                    const result = {trackInfo, trackUid: uid};
                    this.postMessage({type: `metadataResult`, result});
                    if (!trackInfo.hasBeenAnalyzed) {
                        this.analyzer.postJob(file, uid);
                    }
                    // This.emit("metadataParsed")
                } catch (e) {
                    const result = {
                        error: {
                            message: e.message
                        }
                    };
                    this.postMessage({type: `metadataResult`, result, error: result.error});
                }
            }
        };
    }

    async analyze(job, file, uid) {
        const {id, cancellationToken} = job;
        let decoder, resampler, fingerprinter, channelMixer;
        const {db, wasm} = this;
        try {
            const trackInfo = await db.getTrackInfoByTrackUid(uid);

            if (!trackInfo || trackInfo.hasBeenAnalyzed) {
                return;
            }

            const DecoderContext = await getCodec(trackInfo.codecName);

            const {sampleRate, duration, channels, demuxData} = trackInfo;
            const sourceSampleRate = sampleRate;
            const sourceChannelCount = channels;
            const {dataStart, dataEnd} = demuxData;
            let fingerprint = null;

            if (duration >= 15) {
                decoder = new DecoderContext(wasm, {
                    targetBufferLengthAudioFrames: BUFFER_DURATION * sampleRate
                });
                decoder.start(demuxData);

                fingerprinter = new Fingerprinter(wasm);
                const {destinationChannelCount, destinationSampleRate, resamplerQuality} = fingerprinter;
                resampler = allocResampler(wasm,
                                           destinationChannelCount,
                                           sourceSampleRate,
                                           destinationSampleRate,
                                           resamplerQuality);
                channelMixer = new ChannelMixer(wasm, {destinationChannelCount});
                const audioPipeline = new AudioProcessingPipeline(wasm, {
                    sourceSampleRate, sourceChannelCount,
                    destinationSampleRate, destinationChannelCount,
                    decoder, resampler, channelMixer, fingerprinter,
                    bufferTime: BUFFER_DURATION,
                    bufferAudioFrameCount: destinationSampleRate * BUFFER_DURATION
                });

                const fileStartPosition = dataStart;
                let filePosition = fileStartPosition;
                const fileEndPosition = dataEnd;
                const fileView = new FileView(file);

                while (filePosition < fileEndPosition && fingerprinter.needFrames()) {
                    const bytesRead = await audioPipeline.decodeFromFileViewAtOffset(fileView,
                                                                                     filePosition,
                                                                                     demuxData,
                                                                                     cancellationToken);
                    audioPipeline.consumeFilledBuffer();
                    filePosition += bytesRead;
                }
                fingerprint = fingerprinter.calculateFingerprint();
            }

            if (fingerprint) {
                await this.db.addAcoustIdFetchJob(uid, fingerprint, duration, JOB_STATE_INITIAL);
                this.acoustIdDataFetcher.postJob();
                this.db.updateHasBeenAnalyzed(uid, true);
            }
        } finally {
            if (decoder) decoder.destroy();
            if (resampler) freeResampler(resampler);
            if (fingerprinter) fingerprinter.destroy();
            if (channelMixer) channelMixer.destroy();
        }
    }

    async fetchAcoustIdData() {
        const job = await this.db.getAcoustIdFetchJob();
        if (!job) {
            return;
        }

        const {trackUid, fingerprint, duration, jobId} = job;
        let {acoustIdResult, state} = job;
        let trackInfo;
        let trackInfoUpdated = false;
        const waitLongTime = !!job.lastError;

        if (state === JOB_STATE_INITIAL) {
            try {
               const result = await this.metadataManager.fetchAcoustId(trackUid, fingerprint, duration);
                ({acoustIdResult, trackInfo, trackInfoUpdated} = result);
                await this.db.updateAcoustIdFetchJobState(jobId, {
                    acoustIdResult: acoustIdResult || null,
                    state: JOB_STATE_DATA_FETCHED
                });
                state = JOB_STATE_DATA_FETCHED;
            } catch (e) {
                await this.db.setAcoustIdFetchJobError(e);
                if (waitLongTime) {
                    await delay(10000);
                }
                return;
            }
        }

        if (state === JOB_STATE_DATA_FETCHED && acoustIdResult) {
            if (!trackInfo) {
                trackInfo = await this.db.getTrackInfoByTrackUid(trackUid);
            }

            try {
                const fetchedCoverArt = await this.metadataManager.fetchCoverArtInfo(acoustIdResult, trackInfo);
                if (!trackInfoUpdated) {
                    trackInfoUpdated = fetchedCoverArt;
                }
            } catch (e) {
                await this.db.setAcoustIdFetchJobError(e);
                if (waitLongTime) {
                    await delay(10000);
                }
                return;
            }
            await this.db.completeAcoustIdFetchJob(jobId);
        }

        // This.emit("metadataParsed")
        this.postMessage({type: `acoustIdDataFetched`, result: {trackInfo, trackInfoUpdated}});
        if (waitLongTime) {
            await delay(10000);
        }
    }
}
