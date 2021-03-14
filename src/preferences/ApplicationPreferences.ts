import { ApplicationPreferences } from "Application";
import { DEFAULT_BUFFER_LENGTH_SECONDS, MAX_BUFFER_LENGTH_SECONDS, MIN_BUFFER_LENGTH_SECONDS } from "audio/buffering";
import { AbstractPreferenceManager } from "preferences/PreferenceCreator";

export const minBufferLengthValue = (MIN_BUFFER_LENGTH_SECONDS * 1000) | 0;
export const maxBufferLengthValue = (MAX_BUFFER_LENGTH_SECONDS * 1000) | 0;
export const defaultBufferLengthValue = (DEFAULT_BUFFER_LENGTH_SECONDS * 1000) | 0;

export class ApplicationPreferencesManager
    extends AbstractPreferenceManager<ApplicationPreferences>
    implements ApplicationPreferences {
    enableAlbumArt: boolean;
    enableLoudnessNormalization: boolean;
    enableSilenceTrimming: boolean;
    enableOffline: boolean;
    bufferLengthMilliSeconds: number;

    constructor(prefs?: ApplicationPreferences) {
        super(ApplicationPreferences);
        this.enableAlbumArt = true;
        this.enableLoudnessNormalization = true;
        this.enableSilenceTrimming = true;
        this.enableOffline = true;
        this.bufferLengthMilliSeconds = defaultBufferLengthValue;
        if (prefs) {
            this.copyFrom(prefs);
        }
    }

    setBufferLengthMilliSeconds(value: number) {
        let ret = Math.max(minBufferLengthValue, Math.min(maxBufferLengthValue, +value));
        ret = isFinite(ret) ? ret : defaultBufferLengthValue;
        ret = Math.round(ret / 100) * 100;
        this.bufferLengthMilliSeconds = value;
    }
}
