import {
    ApplicationPreferences,
    defaultBufferLengthValue,
    maxBufferLengthValue,
    minBufferLengthValue,
} from "shared/preferences";
import { AbstractPreferenceManager } from "ui/preferences/PreferenceCreator";

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
