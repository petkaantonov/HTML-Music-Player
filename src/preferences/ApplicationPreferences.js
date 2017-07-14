import createPreferences from "preferences/PreferenceCreator";

export const STORAGE_KEY = `application-preferences`;

const validBoolean = function(val) {
    return !!val;
};

export const Preferences = createPreferences({
    methods: {},
    preferences: {
        enableMobileNetwork: {
            defaultValue: false,
            asValidValue: validBoolean
        },
        enableAlbumArt: {
            defaultValue: true,
            asValidValue: validBoolean
        },

        enableLoudnessNormalization: {
            defaultValue: true,
            asValidValue: validBoolean
        },

        enableOffline: {
            defaultValue: true,
            asValidValue: validBoolean
        }
    }
});
