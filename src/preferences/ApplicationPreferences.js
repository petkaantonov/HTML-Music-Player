import createPreferences from "preferences/PreferenceCreator";
import {DEFAULT_BUFFER_LENGTH_SECONDS,
        MIN_BUFFER_LENGTH_SECONDS,
        MAX_BUFFER_LENGTH_SECONDS} from "audio/frontend/buffering";


export const minBufferLengthValue = MIN_BUFFER_LENGTH_SECONDS * 1000 | 0;
export const maxBufferLengthValue = MAX_BUFFER_LENGTH_SECONDS * 1000 | 0;
export const defaultBufferLengthValue = DEFAULT_BUFFER_LENGTH_SECONDS * 1000 | 0;

export const STORAGE_KEY = `application-preferences`;

const validBoolean = function(val) {
    return !!val;
};

export const Preferences = createPreferences({
    methods: {},
    preferences: {
        enableAlbumArt: {
            defaultValue: true,
            asValidValue: validBoolean
        },

        enableLoudnessNormalization: {
            defaultValue: true,
            asValidValue: validBoolean
        },

        enableSilenceTrimming: {
            defaultValue: true,
            asValidValue: validBoolean
        },

        enableOffline: {
            defaultValue: true,
            asValidValue: validBoolean
        },

        bufferLengthMilliSeconds: {
            defaultValue: defaultBufferLengthValue,
            asValidValue(value) {
                let ret = Math.max(minBufferLengthValue,
                                Math.min(maxBufferLengthValue, + value));
                ret = isFinite(ret) ? ret : defaultBufferLengthValue;
                ret = Math.ceil(ret / 100) * 100;
                return ret;
            }
        }
    }
});
