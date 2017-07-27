import {ToggleableValue, SlideableValue} from "ui/templates";
import {ToggleableValuePreferenceUiBinding, SlideableValuePreferenceUiBinding} from "preferences/uibinders";
import AbstractUiBindingManager from "ui/AbstractUiBindingManager";
import {STORAGE_KEY, Preferences,
        minBufferLengthValue, maxBufferLengthValue} from "preferences/ApplicationPreferences";
import AbstractPreferencesBindingContext from "ui/AbstractPreferencesBindingContext";

const TEMPLATE = `<div class='settings-container preferences-popup-content-container'>
    <div class="inputs-container">
        <div class="label wide-label subtitle">Playback</div>
    </div>
    <div class='section-container show-album-art-container'></div>
    <p>
        Shows album art related to the currently playing track. Disabling may reduce network usage.
    </p>
    <div class='section-container normalize-loudness-container'></div>
    <p>
        Audio volume is adjusted in real-time to match reference levels. Disabling may improve performance.
    </p>
    <div class='section-container trim-silence-container'></div>
    <p>
        Silent parts of audio are fast-forwarded instead of played. Disabling may improve performance.
    </p>
    <div class="inputs-container">
        <div class="label wide-label subtitle">Buffering</div>
    </div>
        <p>
            Increase this value if you are experiencing audio drop outs.
            Bigger values mean longer reaction times to seeking, changing tracks and effect changes.
        </p>
    <div class='section-container buffer-length-container'></div>
    <div class="clearfix">
        <span class="inline-label">Current decoding latency</span>
        <div class="inline-label pull-right">
            <span class="decoding-latency-avg fixed-width-small-label">N/A</span>
            <span class="inline-separator"> </span>
            Max: <span class="decoding-latency-max fixed-width-small-label">N/A</span>
        </div>
    </div>
    <div class='section-separator'></div>
    <div class="inputs-container">
        <div class="label wide-label subtitle">Network</div>
    </div>
    <div class='section-container offline-use-container'></div>
    <p>
        Automatically prepare any online streamed audio to be played offline later on. Disabling may reduce network usage.
    </p>
</div>`;

class PreferencesManager extends AbstractUiBindingManager {
    constructor(rootSelector, bindingContext) {
        super(rootSelector, bindingContext, new Preferences());

        this.
        addBinding(new ToggleableValuePreferenceUiBinding(
            this.$().find(`.show-album-art-container`),
            new ToggleableValue({checkboxLabel: `Show album art`}),
            `enableAlbumArt`,
            this
        )).
        addBinding(new ToggleableValuePreferenceUiBinding(
            this.$().find(`.normalize-loudness-container`),
            new ToggleableValue({checkboxLabel: `Normalize loudness`}),
            `enableLoudnessNormalization`,
            this
        )).
        addBinding(new ToggleableValuePreferenceUiBinding(
            this.$().find(`.trim-silence-container`),
            new ToggleableValue({checkboxLabel: `Skip silence`}),
            `enableSilenceTrimming`,
            this
        )).
        addBinding(new SlideableValuePreferenceUiBinding(
            this.$().find(`.buffer-length-container`),
            new SlideableValue({
                sliderLabel: `Duration`,
                valueFormatter: value => `${value.toFixed(0)}ms`,
                minValue: minBufferLengthValue,
                maxValue: maxBufferLengthValue
            }, {
                sliderContext: bindingContext.sliderContext()
            }),
            `bufferLengthMilliSeconds`,
            this
        )).
        addBinding(new ToggleableValuePreferenceUiBinding(
            this.$().find(`.offline-use-container`),
            new ToggleableValue({checkboxLabel: `Download tracks for offline use`}),
            `enableOffline`,
            this
        ));

        bindingContext.on(`newDecodingLatencyValue`, () => {
            const avg = bindingContext.getDecodingLatencyAvg();
            const max = bindingContext.getDecodingLatencyMax();
            this.$().find(`.decoding-latency-avg`).setText(`${avg.toFixed(0)}ms`);
            this.$().find(`.decoding-latency-max`).setText(`${max.toFixed(0)}ms`);
        });
    }
}

export default class ApplicationPreferencesBindingContext extends AbstractPreferencesBindingContext {
    constructor(deps) {
        super(new Preferences(), deps, {
            storageKey: STORAGE_KEY,
            title: `Preferences`,
            template: TEMPLATE
        });
        deps.mainMenu.on(`preferences`, this.openPopup.bind(this));
        this._decodingLatencyAvg = 0;
        this._decodingLatencyMax = 0;
    }

    _createManager() {
        return new PreferencesManager(this.popup().$(), this);
    }

    getDecodingLatencyMax() {
        return this._decodingLatencyMax;
    }

    getDecodingLatencyAvg() {
        return this._decodingLatencyAvg;
    }


    willUpdatePreferences(oldPreferences, newPreferences) {
        if (oldPreferences.getBufferLengthMilliSeconds() !==
            newPreferences.getBufferLengthMilliSeconds()) {
            this.bufferLengthChanged();
        }
    }

    willUpdatePreference(key) {
        if (key === `bufferLengthMilliSeconds`) {
            this.bufferLengthChanged();
        }
    }

    bufferLengthChanged() {
        this._decodingLatencyMax = 0;
    }

    decodingLatencyValue(latencyValue) {
        const alpha = 0.1;
        this._decodingLatencyAvg = this._decodingLatencyAvg * (1 - alpha) + latencyValue * alpha;
        this._decodingLatencyMax = Math.max(latencyValue, this._decodingLatencyMax);
        if (this.isActive()) {
            this.emit(`newDecodingLatencyValue`);
        }
    }
}
