import * as io from "io-ts";

import { DEFAULT_BUFFER_LENGTH_SECONDS, MAX_BUFFER_LENGTH_SECONDS, MIN_BUFFER_LENGTH_SECONDS } from "./audio";
import { ioTypeFromClass, NumberValueBetween, typedKeys } from "./types/helpers";

export interface Preference {
    key: keyof StoredKVValues;
    value: string | number | boolean | object;
}
export type PreferenceArray = Preference[];

export const Xy = io.type({
    x: io.number,
    y: io.number,
});
export type Xy = io.TypeOf<typeof Xy>;

export const PopupPreference = io.intersection([
    io.partial({ screenPosition: Xy }),
    io.type({
        scrollPosition: Xy,
    }),
]);
export type PopupPreference = io.TypeOf<typeof PopupPreference>;

export const PopupPreferences = {
    effectPreferencesPopup: PopupPreference,
    applicationPreferencesPopup: PopupPreference,
};

export const PopupPreferenceKey = io.keyof(PopupPreferences);
export type PopupPreferenceKey = io.TypeOf<typeof PopupPreferenceKey>;

export const ApplicationPreferences = io.type({
    enableAlbumArt: io.boolean,
    enableLoudnessNormalization: io.boolean,
    enableSilenceTrimming: io.boolean,
    enableOffline: io.boolean,
    bufferLengthMilliSeconds: io.number,
});
export type ApplicationPreferences = io.TypeOf<typeof ApplicationPreferences>;
export const EffectPreferences = io.type({
    equalizer: io.array(io.number),
    bassBoostStrength: io.number,
    bassBoostEnabled: io.boolean,
    noiseSharpeningStrength: io.number,
    noiseSharpeningEnabled: io.boolean,
    shouldAlbumNotCrossfade: io.boolean,
    crossfadeEnabled: io.boolean,
    crossfadeDuration: io.number,
});
export type EffectPreferences = io.TypeOf<typeof EffectPreferences>;

export const Preferences = io.union([ApplicationPreferences, EffectPreferences]);
export type Preferences = io.TypeOf<typeof Preferences>;

export const PreferenceCategories = {
    applicationPreferences: ApplicationPreferences,
    effectPreferences: EffectPreferences,
};

export const PreferenceCategoryKey = io.keyof(PreferenceCategories);
export type PreferenceCategoryKey = io.TypeOf<typeof PreferenceCategoryKey>;

export const gestureEducationMessages = {
    next: io.literal(`Swipe right to play the next track`),
    previous: io.literal(`Swip left to play the previous track`),
};
export const StoredGestureEducationMessages = io.partial(gestureEducationMessages);
export type StoredGestureEducationMessages = io.TypeOf<typeof StoredGestureEducationMessages>;
export const GestureEducationMessage = io.keyof(gestureEducationMessages);
export type GestureEducationMessage = io.TypeOf<typeof GestureEducationMessage>;

export const TimeDisplayPreference = io.keyof({
    elapsed: null,
    remaining: null,
});
export type TimeDisplayPreference = io.TypeOf<typeof TimeDisplayPreference>;

export const TabId = io.keyof({
    playlist: null,
    search: null,
    queue: null,
});
export type TabId = io.TypeOf<typeof TabId>;

export const PlaylistMode = io.keyof({
    shuffle: null,
    normal: null,
    repeat: null,
});
export type PlaylistMode = io.TypeOf<typeof PlaylistMode>;

export const TrackOriginName = io.keyof({
    playlist: null,
    search: null,
});
export type TrackOriginName = io.TypeOf<typeof TrackOriginName>;

export const IoArrayBuffer = ioTypeFromClass(ArrayBuffer);

export const ListControllerPreferences = io.partial({
    selectionRanges: io.array(io.tuple([io.number, io.number])),
    scrollPosition: io.number,
});
export type ListControllerPreferences = io.TypeOf<typeof ListControllerPreferences>;
export const ListControllerPreferenceTypes = {
    playlistController: ListControllerPreferences,
    searchController: ListControllerPreferences,
};
export const ControllerKey = io.keyof(ListControllerPreferenceTypes);
export type ControllerKey = io.TypeOf<typeof ControllerKey>;
export const SerializedPlaylistTrack = io.type({
    index: io.number,
    trackUid: IoArrayBuffer,
    origin: TrackOriginName,
});
export type SerializedPlaylistTrack = io.TypeOf<typeof SerializedPlaylistTrack>;
export const StoredKVValues = io.partial({
    volume: NumberValueBetween(0, 1),
    muted: io.boolean,
    currentPlaylistTrack: io.union([SerializedPlaylistTrack, io.null]),
    currentTrackProgress: NumberValueBetween(0, 1),
    playlistContents: io.array(IoArrayBuffer),
    playlistHistory: io.array(SerializedPlaylistTrack),
    playlistMode: PlaylistMode,
    searchHistory: io.array(io.string),
    searchQuery: io.string,
    visibleTabId: TabId,
    timeDisplayPreference: TimeDisplayPreference,
    gestureEducations: io.partial(gestureEducationMessages),
    ...PopupPreferences,
    ...PreferenceCategories,
    ...ListControllerPreferenceTypes,
});
export type StoredKVValues = io.TypeOf<typeof StoredKVValues>;

export interface AudioPlayerEffects {
    0: {
        name: "noise-sharpening";
        effectSize: number;
    };
    1: { name: "bass-boost"; effectSize: number };
    2: { name: "equalizer"; gains: EqualizerGains };
}

export type EqualizerGains = [number, number, number, number, number, number, number, number, number, number];
export const equalizerPresets = {
    None: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as EqualizerGains,
    Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as EqualizerGains,
    Classical: [
        0,
        0,
        0,
        0,
        0,
        0,
        -4.64516129032258,
        -4.64516129032258,
        -4.64516129032258,
        -6.193548387096774,
    ] as EqualizerGains,
    Club: [
        0,
        0,
        1.935483870967742,
        3.483870967741936,
        3.483870967741936,
        3.483870967741936,
        1.935483870967742,
        0,
        0,
        0,
    ] as EqualizerGains,
    Dance: [
        5.806451612903226,
        4.258064516129032,
        1.161290322580645,
        0,
        0,
        -3.870967741935484,
        -4.64516129032258,
        -4.64516129032258,
        0,
        0,
    ] as EqualizerGains,
    "Full Bass": [
        5.806451612903226,
        5.806451612903226,
        5.806451612903226,
        3.483870967741936,
        0.7741935483870968,
        -2.7096774193548385,
        -5.419354838709677,
        -6.580645161290322,
        -6.967741935483872,
        -6.967741935483872,
    ] as EqualizerGains,
    "Full Bass & Treble": [
        4.258064516129032,
        3.483870967741936,
        0,
        -4.64516129032258,
        -3.096774193548387,
        0.7741935483870968,
        5.032258064516129,
        6.580645161290322,
        7.35483870967742,
        7.35483870967742,
    ] as EqualizerGains,
    "Full Treble": [
        -6.193548387096774,
        -6.193548387096774,
        -6.193548387096774,
        -2.7096774193548385,
        1.5483870967741935,
        6.580645161290322,
        9.677419354838708,
        9.677419354838708,
        9.677419354838708,
        10.451612903225806,
    ] as EqualizerGains,
    "Laptop Speakers / Headphone": [
        2.7096774193548385,
        6.580645161290322,
        3.096774193548387,
        -2.32258064516129,
        -1.5483870967741935,
        0.7741935483870968,
        2.7096774193548385,
        5.806451612903226,
        7.741935483870968,
        8.903225806451612,
    ] as EqualizerGains,
    "Large Hall": [
        6.193548387096774,
        6.193548387096774,
        3.483870967741936,
        3.483870967741936,
        0,
        -3.096774193548387,
        -3.096774193548387,
        -3.096774193548387,
        0,
        0,
    ] as EqualizerGains,
    Live: [
        -3.096774193548387,
        0,
        2.32258064516129,
        3.096774193548387,
        3.483870967741936,
        3.483870967741936,
        2.32258064516129,
        1.5483870967741935,
        1.5483870967741935,
        1.161290322580645,
    ] as EqualizerGains,
    Party: [
        4.258064516129032,
        4.258064516129032,
        0,
        0,
        0,
        0,
        0,
        0,
        4.258064516129032,
        4.258064516129032,
    ] as EqualizerGains,
    Pop: [
        -1.161290322580645,
        2.7096774193548385,
        4.258064516129032,
        4.64516129032258,
        3.096774193548387,
        -0.7741935483870968,
        -1.5483870967741935,
        -1.5483870967741935,
        -1.161290322580645,
        -1.161290322580645,
    ] as EqualizerGains,
    Reggae: [
        0,
        0,
        -0.3870967741935484,
        -3.870967741935484,
        0,
        3.870967741935484,
        3.870967741935484,
        0,
        0,
        0,
    ] as EqualizerGains,
    Rock: [
        4.64516129032258,
        2.7096774193548385,
        -3.483870967741936,
        -5.032258064516129,
        -2.32258064516129,
        2.32258064516129,
        5.419354838709677,
        6.580645161290322,
        6.580645161290322,
        6.580645161290322,
    ] as EqualizerGains,
    Ska: [
        -1.5483870967741935,
        -3.096774193548387,
        -2.7096774193548385,
        -0.3870967741935484,
        2.32258064516129,
        3.483870967741936,
        5.419354838709677,
        5.806451612903226,
        6.580645161290322,
        5.806451612903226,
    ] as EqualizerGains,
    Soft: [
        2.7096774193548385,
        0.7741935483870968,
        -0.7741935483870968,
        -1.5483870967741935,
        -0.7741935483870968,
        2.32258064516129,
        5.032258064516129,
        5.806451612903226,
        6.580645161290322,
        7.35483870967742,
    ] as EqualizerGains,
    "Soft Rock": [
        2.32258064516129,
        2.32258064516129,
        1.161290322580645,
        -0.3870967741935484,
        -2.7096774193548385,
        -3.483870967741936,
        -2.32258064516129,
        -0.3870967741935484,
        1.5483870967741935,
        5.419354838709677,
    ] as EqualizerGains,
    Techno: [
        4.64516129032258,
        3.483870967741936,
        0,
        -3.483870967741936,
        -3.096774193548387,
        0,
        4.64516129032258,
        5.806451612903226,
        5.806451612903226,
        5.419354838709677,
    ] as EqualizerGains,
};
export type BandType = "lowshelf" | "peaking" | "highshelf";

export const equalizerBands: [number, BandType][] = [
    [70, `lowshelf`],
    [180, `peaking`],
    [320, `peaking`],
    [600, `peaking`],
    [1000, `peaking`],
    [3000, `peaking`],
    [6000, `peaking`],
    [12000, `peaking`],
    [14000, `peaking`],
    [16000, `highshelf`],
];

export const EQUALIZER_MAX_GAIN = 12;
export const EQUALIZER_MIN_GAIN = -12;
export const STORAGE_KEY = `effect-preferences`;
export const CROSSFADE_MIN_DURATION = Math.max(MIN_BUFFER_LENGTH_SECONDS, 1);
export const CROSSFADE_MAX_DURATION = 5;
export const CROSSFADE_DEFAULT_DURATION = Math.min(CROSSFADE_MAX_DURATION, Math.max(CROSSFADE_MIN_DURATION, 5));
export const MIN_NOISE_SHARPENING_EFFECT_SIZE = 0;
export const MAX_NOISE_SHARPENING_EFFECT_SIZE = 2;
export const DEFAULT_NOISE_SHARPENING_EFFECT_SIZE = 0.6;
export const MIN_BASS_BOOST_EFFECT_SIZE = 0;
export const MAX_BASS_BOOST_EFFECT_SIZE = 1;
export const DEFAULT_BASS_BOOST_EFFECT_SIZE = 0.4;

export const gainValueToProgress = function (gainValue: number) {
    const max = Math.abs(EQUALIZER_MIN_GAIN) + Math.abs(EQUALIZER_MAX_GAIN);
    const abs = gainValue + EQUALIZER_MAX_GAIN;
    return abs / max;
};

export const progressToGainValue = function (progress: number) {
    const max = Math.abs(EQUALIZER_MIN_GAIN) + Math.abs(EQUALIZER_MAX_GAIN);
    const value = Math.round(progress * max);
    return value - Math.abs(EQUALIZER_MAX_GAIN);
};

export const formatFreq = function (freq: number) {
    if (freq < 1000) {
        return `${freq} Hz`;
    } else {
        return `${Math.round(freq / 1000)} KHz`;
    }
};

export const equalizerPresetKeys = typedKeys(equalizerPresets);
export type EqualizerPresetKey = keyof typeof equalizerPresets | "Custom";

export const minBufferLengthValue = (MIN_BUFFER_LENGTH_SECONDS * 1000) | 0;
export const maxBufferLengthValue = (MAX_BUFFER_LENGTH_SECONDS * 1000) | 0;
export const defaultBufferLengthValue = (DEFAULT_BUFFER_LENGTH_SECONDS * 1000) | 0;
