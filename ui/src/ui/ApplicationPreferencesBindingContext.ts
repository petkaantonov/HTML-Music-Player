import { ApplicationPreferences, maxBufferLengthValue, minBufferLengthValue } from "shared/preferences";
import { SelectDeps } from "ui/Application";
import { DomWrapperSelector } from "ui/platform/dom/Page";
import { ApplicationPreferencesManager } from "ui/preferences/ApplicationPreferences";
import { SlideableValuePreferenceUiBinding, ToggleableValuePreferenceUiBinding } from "ui/preferences/uibinders";
import AbstractPreferencesBindingContext from "ui/ui/AbstractPreferencesBindingContext";
import AbstractUiBindingManager from "ui/ui/AbstractUiBindingManager";
import { SlideableValue, ToggleableValue } from "ui/ui/templates";

const TEMPLATE = `

    <header class="section-header">Playback</header>

    <section class="js-show-album-art-container one-item-headerless-section"></section>
    <p class="section-paragraph">Shows album art related to the currently playing track. Disabling may reduce network usage.</p>
    <div class="section-separator"></div>

    <section class="js-normalize-loudness-container one-item-headerless-section"></section>
    <p class="section-paragraph">Audio volume is adjusted in real-time to match reference levels. Disabling may improve performance.</p>
    <div class="section-separator"></div>

    <section class="js-trim-silence-container one-item-headerless-section"></section>
    <p class="section-paragraph">Silent parts of audio are fast-forwarded instead of played. Disabling may improve performance.</p>
    <div class="section-separator"></div>


    <header class="section-header">Buffering</header>
    <p class="section-paragraph">
        Increase this value if you are experiencing audio drop outs.
        Bigger values mean longer reaction times to seeking, changing tracks and effect changes.
    </p>
    <section class="one-item-headerless-section js-buffer-length-container">
    </section>
    <section class="decoding-latency">
        <label class="decoding-latency-label">Current decoding latency</label>
        <span class="decoding-latency-avg js-decoding-latency-avg">N/A</span>
        <label class="decoding-latency-max-label">Max:</label>
        <span class="decoding-latency-max js-decoding-latency-max">N/A</span>
    </section>

    <div class="section-separator"></div>
    <header class="section-header">Network</header>
    <section class="js-offline-use-container one-item-headerless-section"></section>
    <p class="section-paragraph">Automatically prepare any online streamed audio to be played offline later on. Disabling may reduce network usage.</p>
`;

class ApplicationPreferencesUiBindingManager extends AbstractUiBindingManager<
    ApplicationPreferences,
    ApplicationPreferencesManager
> {
    constructor(rootSelector: DomWrapperSelector, bindingContext: ApplicationPreferencesBindingContext) {
        super(rootSelector, bindingContext, new ApplicationPreferencesManager().toJSON());

        this.addBinding(
            new ToggleableValuePreferenceUiBinding(
                this.$().find(`.js-show-album-art-container`),
                new ToggleableValue({ checkboxLabel: `Show album art` }),
                `enableAlbumArt`,
                this
            )
        )
            .addBinding(
                new ToggleableValuePreferenceUiBinding(
                    this.$().find(`.js-normalize-loudness-container`),
                    new ToggleableValue({ checkboxLabel: `Normalize loudness` }),
                    `enableLoudnessNormalization`,
                    this
                )
            )
            .addBinding(
                new ToggleableValuePreferenceUiBinding(
                    this.$().find(`.js-trim-silence-container`),
                    new ToggleableValue({ checkboxLabel: `Skip silence` }),
                    `enableSilenceTrimming`,
                    this
                )
            )
            .addBinding(
                new SlideableValuePreferenceUiBinding(
                    this.$().find(`.js-buffer-length-container`),
                    new SlideableValue(
                        {
                            sliderLabel: `Duration`,
                            valueFormatter: value => `${value.toFixed(0)}ms`,
                            minValue: minBufferLengthValue,
                            maxValue: maxBufferLengthValue,
                        },
                        {
                            sliderContext: bindingContext.sliderContext(),
                        }
                    ),
                    `bufferLengthMilliSeconds`,
                    this
                )
            )
            .addBinding(
                new ToggleableValuePreferenceUiBinding(
                    this.$().find(`.js-offline-use-container`),
                    new ToggleableValue({ checkboxLabel: `Download tracks for offline use` }),
                    `enableOffline`,
                    this
                )
            );

        bindingContext.on(`newDecodingLatencyValue`, () => {
            const avg = bindingContext.getDecodingLatencyAvg();
            const max = bindingContext.getDecodingLatencyMax();
            this.$()
                .find(`.js-decoding-latency-avg`)
                .setText(`${avg.toFixed(0)}ms`);
            this.$()
                .find(`.js-decoding-latency-max`)
                .setText(`${max.toFixed(0)}ms`);
        });
    }
}

type Deps = SelectDeps<
    | "page"
    | "env"
    | "rippler"
    | "popupContext"
    | "db"
    | "dbValues"
    | "recognizerContext"
    | "sliderContext"
    | "globalEvents"
    | "mainMenu"
>;

export default class ApplicationPreferencesBindingContext extends AbstractPreferencesBindingContext<
    ApplicationPreferences,
    ApplicationPreferencesManager,
    ApplicationPreferencesUiBindingManager
> {
    private _decodingLatencyAvg: number;
    private _decodingLatencyMax: number;
    constructor(deps: Deps) {
        super(new ApplicationPreferencesManager(), deps, {
            popupPreferenceKey: "applicationPreferencesPopup",
            preferenceCategoryKey: "applicationPreferences",
            title: `Preferences`,
            template: TEMPLATE,
        });
        deps.mainMenu.on(`preferences`, this.openPopup);
        this._decodingLatencyAvg = 0;
        this._decodingLatencyMax = 0;
    }

    _createManager() {
        return new ApplicationPreferencesUiBindingManager(this.popup().$(), this);
    }

    getDecodingLatencyMax() {
        return this._decodingLatencyMax;
    }

    getDecodingLatencyAvg() {
        return this._decodingLatencyAvg;
    }

    willUpdatePreferences(oldPreferences: ApplicationPreferences, newPreferences: ApplicationPreferences) {
        if (oldPreferences.bufferLengthMilliSeconds !== newPreferences.bufferLengthMilliSeconds) {
            this.bufferLengthChanged();
        }
    }

    willUpdatePreference<Key extends keyof ApplicationPreferences>(key: Key) {
        if (key === `bufferLengthMilliSeconds`) {
            this.bufferLengthChanged();
        }
    }

    bufferLengthChanged() {
        this._decodingLatencyMax = 0;
    }

    decodingLatencyValue(latencyValue: number) {
        const alpha = 0.1;
        this._decodingLatencyAvg = this._decodingLatencyAvg * (1 - alpha) + latencyValue * alpha;
        this._decodingLatencyMax = Math.max(latencyValue, this._decodingLatencyMax);
        if (this.isActive()) {
            this.emit(`newDecodingLatencyValue`);
        }
    }
}
