import {ToggleableValue, SlideableValue} from "ui/templates";
import {ToggleableValuePreferenceUiBinding, SlideableValuePreferenceUiBinding} from "preferences/uibinders";
import AbstractUiBindingManager from "ui/AbstractUiBindingManager";
import {Float64Array} from "platform/platform";
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

        bindingContext.on("decodingLatencyReset", () => {
            this.$().find(`.decoding-latency-avg, .decoding-latency-max`).setText(`N/A`);
        });

        this.update();
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
        this._decodingLatencyValues = new Float64Array(10);
        this._decodingLatencyValueIndex = 0;
    }

    _createManager() {
        return new PreferencesManager(this.popup().$(), this);
    }

    getDecodingLatencyMax() {
        return Math.max(...this._decodingLatencyValues);
    }

    getDecodingLatencyAvg() {
        let sum = 0;
        let j = 0;
        for (let i = 0; i < this._decodingLatencyValues.length; ++i) {
            const value = this._decodingLatencyValues[i];
            if (value !== 0) {
                sum += value;
                j++;
            }
        }
        return sum / j;
    }

    willUpdatePreferences(oldPreferences, newPreferences) {
        if (oldPreferences.getBufferLengthMilliSeconds() !==
            newPreferences.getBufferLengthMilliSeconds()) {
            this.bufferLengthChanged();
        }
    }

    willUpdatePreference(key) {
        if (key === "bufferLengthMilliSeconds") {
            this.bufferLengthChanged();
        }
    }

    bufferLengthChanged() {
        this.emit("decodingLatencyReset");
    }

    decodingLatencyValue(latencyValue) {
        const index = this._decodingLatencyValueIndex++;
        this._decodingLatencyValueIndex %= (this._decodingLatencyValues.length);
        this._decodingLatencyValues[index] = latencyValue;
        if (this.isActive()) {
            this.emit(`newDecodingLatencyValue`);
        }
    }
}
