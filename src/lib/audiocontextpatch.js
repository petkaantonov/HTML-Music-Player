"use strict";

import Promise from "bluebird";

export default function patch(AudioContext, instance) {
    if (!instance.suspend) {
        instance.constructor.prototype.suspend = function() {
            return Promise.resolve();
        };
        instance.constructor.prototype.resume = function() {
            return Promise.resolve();
        };
    }

    if (window.webkitAudioContext === undefined) return;
    if (window.webkitAudioContext === window.AudioContext) return;
    if (AudioContext.webkitPatched) return;
    AudioContext.webkitPatched = true;

    (function() {
        var p = AudioContext.prototype;
        p.createGain = p.createGainNode || p.createGain;
        p.createDelay = p.createDelayNode || p.createDelay;
        p.createScriptProcessor = p.createJavaScriptNode || p.createScriptProcessor;
        p.createPeriodicWave = p.createWaveTable || p.createPeriodicWave;
    })();

    (function() {
        var AudioParam = instance.createGain().gain.constructor;
        var p = AudioParam.prototype;
        p.setTargetAtTime = p.setTargetValueAtTime || p.setTargetAtTime;
    })();

    (function() {
        var AudioBufferSource = instance.createBufferSource().constructor;
        var p = AudioBufferSource.prototype;

        if (!p.start) {
            var noteOn = p.noteOn;
            p.start = function(when, offset, duration) {
                if (when === undefined) when = 0;
                if (offset === undefined) offset = 0;
                if (duration === undefined) duration = this.buffer.duration - offset;
                return noteOn.call(this, when, offset, duration);
            };
        }

        if (!p.stop) {
            var noteOff = p.noteOff;
            p.stop = function(when) {
                if (when === undefined) when = 0;
                return noteOff.call(this, when);
            };
        }
    })();

    (function() {
        var filterNode = instance.createBiquadFilter();
        var BiquadFilterNode = filterNode.constructor;
        var p = BiquadFilterNode.prototype;
        var filterTypes = ["LOWPASS", "HIGHPASS", "BANDPASS", "LOWSHELF", "HIGHSHELF", "PEAKING", "NOTCH", "ALLPASS"];
        var filterTypeDescriptor = Object.getOwnPropertyDescriptor(p, "type");
        Object.defineProperty(p, "type", {
            get: function() {
                var mappedType = filterTypeDescriptor.get.call(this);
                for (var i = 0; i < filterTypes.length; ++i) {
                    var filterProp = filterTypes[i];
                    if (mappedType === this[filterProp]) {
                        return filterProp.toLowerCase();
                    }
                }
            },

            set: function(standardType) {
                var mappedType = this[standardType.toUpperCase()];
                filterTypeDescriptor.set.call(this, mappedType);
            },
            enumerable: true,
            configurable: true
        });

    })();

    (function() {
        var oscillatorNode = instance.createOscillator();
        var OscillatorNode = oscillatorNode.constructor;
        var p = OscillatorNode.prototype;
        var oscillatorTypes = ["SINE", "SQUARE", "SAWTOOTH", "TRIANGLE", "CUSTOM"];
        var oscillatorTypeDescriptor = Object.getOwnPropertyDescriptor(p, "type");

        if (!p.start) {
            var noteOn = p.noteOn;
            p.start = function(when) {
                if (when === undefined) when = 0;
                return noteOn.call(this, when);
            };
        }

        if (!p.stop) {
            var noteOff = p.noteOff;
            p.stop = function(when) {
                if (when === undefined) when = 0;
                return noteOff.call(this, when);
            };
        }

        Object.defineProperty(p, "type", {
            get: function() {
                var mappedType = oscillatorTypeDescriptor.get.call(this);
                for (var i = 0; i < oscillatorTypes.length; ++i) {
                    var oscillatorProp = oscillatorTypes[i];
                    if (mappedType === this[oscillatorProp]) {
                        return oscillatorProp.toLowerCase();
                    }
                }
            },

            set: function(standardType) {
                var mappedType = this[standardType.toUpperCase()];
                oscillatorTypeDescriptor.set.call(this, mappedType);
            },
            enumerable: true,
            configurable: true
        });
    })();

    (function() {
        var pannerNode = instance.createPanner();
        var PannerNode = pannerNode.constructor;
        var p = PannerNode.prototype;

        var panningModels = ["EQUALPOWER", "HRTF"];
        var distanceModels = ["LINEAR_DISTANCE", "INVERSE_DISTANCE", "EXPONENTIAL_DISTANCE"];

        var panningModelTypeDescriptor = Object.getOwnPropertyDescriptor(p, "panningModel");
        Object.defineProperty(p, "panningModel", {
            get: function() {
                var mappedType = panningModelTypeDescriptor.get.call(this);

                for (var i = 0; i < panningModels.length; ++i) {
                    var pannerProp = panningModels[i];
                    if (mappedType === this[pannerProp]) {
                        if (pannerProp === "HRTF") return "HRTF";
                        return pannerProp.toLowerCase();
                    }
                }
            },

            set: function(standardType) {
                var mappedType = this[standardType.toUpperCase()];
                panningModelTypeDescriptor.set.call(this, mappedType);
            },
            enumerable: true,
            configurable: true
        });

        var distanceModelTypeDescriptor = Object.getOwnPropertyDescriptor(p, "distanceModel");
        Object.defineProperty(p, "distanceModel", {
            get: function() {
                var mappedType = distanceModelTypeDescriptor.get.call(this);

                for (var i = 0; i < distanceModels.length; ++i) {
                    var pannerProp = distanceModels[i];
                    if (mappedType === this[pannerProp]) {
                        return pannerProp.toLowerCase().split("_")[0];
                    }
                }
            },

            set: function(standardType) {
                var mappedType = this[standardType.toUpperCase() + "_DISTANCE"];
                distanceModelTypeDescriptor.set.call(this, mappedType);
            },
            enumerable: true,
            configurable: true
        });
    })();
}
