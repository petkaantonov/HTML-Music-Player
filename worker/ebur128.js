"use strict";
/* Ported to JavaScript from libebur128. */
/*
Copyright (c) 2011 Jan Kokemüller
Copyright (c) 2015 Petka Antonov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
const util = require("../js/util");

const SILENCE_THRESHOLD = -63;
const REFERENCE_LUFS = -18;
const INTERPOLATION_PHASE_LENGTH = 12;

const EBUR128_UNUSED = 0;
const EBUR128_LEFT = 1;
const EBUR128_RIGHT = 2;
const EBUR128_CENTER = 3;
const EBUR128_LEFT_SURROUND = 4;
const EBUR128_RIGHT_SURROUND = 5;
const EBUR128_DUAL_MONO = 6;

const EBUR128_MODE_M = (1 << 0);
const EBUR128_MODE_S = (1 << 1) | EBUR128_MODE_M;
const EBUR128_MODE_I = (1 << 2) | EBUR128_MODE_M;
const EBUR128_MODE_LRA = (1 << 3) | EBUR128_MODE_S;
const EBUR128_MODE_SAMPLE_PEAK = (1 << 4) | EBUR128_MODE_M;
const EBUR128_MODE_TRUE_PEAK = (1 << 5) | EBUR128_MODE_M | EBUR128_MODE_SAMPLE_PEAK;
const EBUR128_MODE_HISTOGRAM = (1 << 6);

const relative_gate = -10.0
const relative_gate_factor = Math.pow(10.0, relative_gate / 10.0);
const minus_twenty_decibels = Math.pow(10.0, -20.0 / 10.0);
const histogram_energies = new Float32Array(1000);
const histogram_energy_boundaries = new Float32Array(1001);
histogram_energy_boundaries[0] = Math.pow(10.0, (-70.0 + 0.691) / 10.0);
for (var i = 1; i < 1001; ++i) {
    histogram_energy_boundaries[i] = Math.pow(10.0, (i / 10.0 - 70.0 + 0.691) / 10.0);
}
for (var i = 0; i < 1000; ++i) {
    histogram_energies[i] = Math.pow(10.0, (i / 10.0 - 69.95 + 0.691) / 10.0);
}

function ebur128_energy_to_loudness(energy) {
    return 10 * (Math.log(energy) * Math.LOG10E) - 0.691;
}

function find_histogram_index(energy) {
    var index_min = 0;
    var index_max = 1000;
    var index_mid;

    do {
        index_mid = ((index_min + index_max) / 2) >> 0;
        if (energy >= histogram_energy_boundaries[index_mid]) {
            index_min = index_mid;
        } else {
            index_max = index_mid;
        }
    } while (index_max - index_min != 1);

    return index_min;
}

const audioDataCache = Object.create(null);

function getFloat32ArrayForFrameCount(frameCount, channel) {
    var key = frameCount + " " + channel;
    if (audioDataCache[key]) {
        var ret = audioDataCache[key];
        for (var i = 0; i < ret.length; ++i) {
            ret[i] = 0;
        }
        return ret;
    }
    var ret = new Float32Array(frameCount);
    audioDataCache[key] = ret;
    return ret;
}

function Ebur128(channels, samplerate, mode) {
    this.mode = mode;
    this.samplerate = samplerate;
    this.channels = Math.max(1, Math.min(channels, 5));
    this.channel_map = [];
    this.initChannels();

    this.sample_peak = new Float32Array(channels);
    this.true_peak = new Float32Array(channels);
    this.use_histogram = (mode & EBUR128_MODE_HISTOGRAM) > 0;
    this.samples_in_100ms = ((samplerate + 5) / 10) >>> 0;
    this.needed_frames = this.samples_in_100ms * 4;
    this.audio_data_index = 0;
    this.audio_data_frames = 0;

    if ((mode & EBUR128_MODE_S) == EBUR128_MODE_S) {
        this.audio_data_frames = this.samples_in_100ms * 30;
    } else if ((mode & EBUR128_MODE_M) == EBUR128_MODE_M) {
        this.audio_data_frames = this.samples_in_100ms * 4;
    } else {
        throw new Error("invalid mode");
    }

    this.audio_data = new Array(channels);
    for (var i = 0; i < channels; ++i) {
        this.audio_data[i] = getFloat32ArrayForFrameCount(this.audio_data_frames, i);
    }

    this.a = new Float32Array(5);
    this.b = new Float32Array(5);
    this.filterState = new Array(channels);
    this.filterStateInt32 = new Array(channels);
    for (var c = 0; c < channels; ++c) {
        this.filterState[c] = new Float32Array(5);
        this.filterStateInt32[c] = new Int32Array(this.filterState[c].buffer);
    }
    this.initFilter();

    this.interpolatorState = new Array(channels);
    for (var c = 0; c < channels; ++c) {
        this.interpolatorState[c] =
            getFloat32ArrayForFrameCount(this.needed_frames + INTERPOLATION_PHASE_LENGTH - 1, c);
    }

    this.block_energy_histogram = null;
    this.short_term_block_energy_histogram = null;
    if (this.use_histogram) {
        this.block_energy_histogram = new Uint32Array(1000);
        this.short_term_block_energy_histogram = new Uint32Array(1000);
    }

    this.block_list = [];
    this.short_term_block_list = [];
    this.short_term_frame_counter = 0;
    this.short_term_frame_counter = 0;

    this.lastSilenceStarted = -1;
    this.currentTime = 0;
    this.beginSilenceLength = 0;
    this.endSilenceLength = 0;
}

Ebur128.prototype.initFilter = function() {
    var samplerate = this.samplerate;
    var f0 = 1681.974450955533;
    var G = 3.999843853973347;
    var Q = 0.7071752369554196;

    var K = Math.tan(Math.PI * f0 / samplerate);
    var Vh = Math.pow(10.0, G / 20.0);
    var Vb = Math.pow(Vh, 0.4996667741545416);

    var pb = new Float32Array([0.0,  0.0, 0.0]);
    var pa = new Float32Array([1.0,  0.0, 0.0]);
    var rb = new Float32Array([1.0, -2.0, 1.0]);
    var ra = new Float32Array([1.0,  0.0, 0.0]);

    var a0 = 1.0 + K / Q + K * K;
    pb[0] = (Vh + Vb * K / Q + K * K) / a0;
    pb[1] = 2.0 * (K * K -  Vh) / a0;
    pb[2] = (Vh - Vb * K / Q + K * K) / a0;
    pa[1] = 2.0 * (K * K - 1.0) / a0;
    pa[2] = (1.0 - K / Q + K * K) / a0;

    f0 = 38.13547087602444;
    Q = 0.5003270373238773;
    K = Math.tan(Math.PI * f0 / samplerate);

    ra[1] = 2.0 * (K * K - 1.0) / (1.0 + K / Q + K * K);
    ra[2] = (1.0 - K / Q + K * K) / (1.0 + K / Q + K * K);

    this.b[0] = pb[0] * rb[0];
    this.b[1] = pb[0] * rb[1] + pb[1] * rb[0];
    this.b[2] = pb[0] * rb[2] + pb[1] * rb[1] + pb[2] * rb[0];
    this.b[3] = pb[1] * rb[2] + pb[2] * rb[1];
    this.b[4] = pb[2] * rb[2];
    this.a[0] = pa[0] * ra[0];
    this.a[1] = pa[0] * ra[1] + pa[1] * ra[0];
    this.a[2] = pa[0] * ra[2] + pa[1] * ra[1] + pa[2] * ra[0];
    this.a[3] = pa[1] * ra[2] + pa[2] * ra[1];
    this.a[4] = pa[2] * ra[2];
};

Ebur128.EBUR128_MODE_M = EBUR128_MODE_M;
Ebur128.EBUR128_MODE_S = EBUR128_MODE_S;
Ebur128.EBUR128_MODE_I = EBUR128_MODE_I;
Ebur128.EBUR128_MODE_LRA = EBUR128_MODE_LRA;
Ebur128.EBUR128_MODE_SAMPLE_PEAK = EBUR128_MODE_SAMPLE_PEAK;
Ebur128.EBUR128_MODE_TRUE_PEAK = EBUR128_MODE_TRUE_PEAK;
Ebur128.EBUR128_MODE_HISTOGRAM = EBUR128_MODE_HISTOGRAM;
Ebur128.REFERENCE_LUFS = REFERENCE_LUFS;

Ebur128.prototype.initChannels = function() {
    var channels = this.channels;
    if (channels === 4) {
        this.channel_map[0] = EBUR128_LEFT;
        this.channel_map[1] = EBUR128_RIGHT;
        this.channel_map[2] = EBUR128_LEFT_SURROUND;
        this.channel_map[3] = EBUR128_RIGHT_SURROUND;
    } else if (channels === 5) {
        this.channel_map[0] = EBUR128_LEFT;
        this.channel_map[1] = EBUR128_RIGHT;
        this.channel_map[2] = EBUR128_CENTER;
        this.channel_map[3] = EBUR128_LEFT_SURROUND;
        this.channel_map[4] = EBUR128_RIGHT_SURROUND;
    } else {
        for (i = 0; i < channels; ++i) {
          switch (i) {
            case 0:  this.channel_map[i] = EBUR128_LEFT;           break;
            case 1:  this.channel_map[i] = EBUR128_RIGHT;          break;
            case 2:  this.channel_map[i] = EBUR128_CENTER;         break;
            case 3:  this.channel_map[i] = EBUR128_UNUSED;         break;
            case 4:  this.channel_map[i] = EBUR128_LEFT_SURROUND;  break;
            case 5:  this.channel_map[i] = EBUR128_RIGHT_SURROUND; break;
            default: this.channel_map[i] = EBUR128_UNUSED;         break;
          }
        }
    }
};

Ebur128.prototype.updateSamplePeak = function(src, srcStart, length) {
    for (var c = 0; c < this.channels; ++c) {
        var peak = -Infinity;
        var channelSrc = src[c];
        for (var i = 0; i < length; ++i) {
            peak = Math.max(peak, Math.abs(channelSrc[i + srcStart]));
        }
        this.sample_peak[c] = Math.max(this.sample_peak[c], peak);
    }
};

var interpolationCoeffs = new Float32Array([
    0.0017089843750, -0.0291748046875, -0.0189208984375, -0.0083007812500,
    0.0109863281250, 0.0292968750000, 0.0330810546875, 0.0148925781250,
    -0.0196533203125, -0.0517578125000, -0.0582275390625, -0.0266113281250,
    0.0332031250000, 0.0891113281250, 0.1015625000000, 0.0476074218750,
    -0.0594482421875, -0.1665039062500, -0.2003173828125, -0.1022949218750,
    0.1373291015625, 0.4650878906250, 0.7797851562500, 0.9721679687500,
    0.9721679687500, 0.7797851562500, 0.4650878906250, 0.1373291015625,
    -0.1022949218750, -0.2003173828125, -0.1665039062500, -0.0594482421875,
    0.0476074218750, 0.1015625000000, 0.0891113281250, 0.0332031250000,
    -0.0266113281250, -0.0582275390625, -0.0517578125000, -0.0196533203125,
    0.0148925781250, 0.0330810546875, 0.0292968750000, 0.0109863281250,
    -0.0083007812500, -0.0189208984375, -0.0291748046875, 0.0017089843750
]);

Ebur128.prototype.updateTruePeak = function(src, srcStart, length) {
    var factor = this.samplerate < 96000 ? 4
                                         : (this.samplerate < 96000 * 2 ? 2 : 1)
    if (factor === 1) {
        for (var c = 0; c < this.channels; ++c) {
            this.true_peak[c] = this.sample_peak[c];
        }
        return;
    }

    var coeffs = interpolationCoeffs;
    for (var c = 0; c < this.channels; ++c) {
        var peak = -Infinity;
        var channelSrc = src[c];
        var v = this.interpolatorState[c];

        for (var i = 0; i < length; ++i) {
            v[i + INTERPOLATION_PHASE_LENGTH - 1] = channelSrc[srcStart + i];

            for (var j = factor - 1; j >= 0; --j) {
                var sample = v[i] * coeffs[j] +
                             v[i + 1] * coeffs[j + 4] +
                             v[i + 2] * coeffs[j + 8] +
                             v[i + 3] * coeffs[j + 12] +
                             v[i + 4] * coeffs[j + 16] +
                             v[i + 5] * coeffs[j + 20] +
                             v[i + 6] * coeffs[j + 24] +
                             v[i + 7] * coeffs[j + 28] +
                             v[i + 8] * coeffs[j + 32] +
                             v[i + 9] * coeffs[j + 36] +
                             v[i + 10] * coeffs[j + 40] +
                             v[i + 11] * coeffs[j + 44];
                peak = Math.max(peak, Math.abs(sample));
            }
        }

        for (var i = length - INTERPOLATION_PHASE_LENGTH - 1; i < length; ++i) {
          v[i - (length - INTERPOLATION_PHASE_LENGTH - 1)] = v[i + INTERPOLATION_PHASE_LENGTH - 1];
        }

        this.true_peak[c] = Math.max(this.true_peak[c], peak);
    }
};

Ebur128.prototype.updateAudioData = function(src, srcStart, length) {
    var audioDataIndex = this.audio_data_index;
    var a = this.a;
    var b = this.b;

    for (var c = 0; c < this.channels; ++c) {
        var v = this.filterState[c];
        var channelSrc = src[c];
        var channelAudioData = this.audio_data[c];

        for (var i = 0; i < length; ++i) {
            v[0] = channelSrc[i + srcStart] -
                                a[1] * v[1] -
                                a[2] * v[2] -
                                a[3] * v[3] -
                                a[4] * v[4];

            channelAudioData[i + audioDataIndex] = b[0] * v[0] +
                                                   b[1] * v[1] +
                                                   b[2] * v[2] +
                                                   b[3] * v[3] +
                                                   b[4] * v[4];
            v[4] = v[3];
            v[3] = v[2];
            v[2] = v[1];
            v[1] = v[0];
        }

        var intV = this.filterStateInt32[c];
        // Get rid of subnormal floating points.
        if ((intV[4] & 0x7f800000) === 0) v[4] = 0;
        if ((intV[3] & 0x7f800000) === 0) v[3] = 0;
        if ((intV[2] & 0x7f800000) === 0) v[2] = 0;
        if ((intV[1] & 0x7f800000) === 0) v[1] = 0;
    }
};

Ebur128.prototype.filter = function(src, src_index, frames) {
    if ((this.mode & EBUR128_MODE_SAMPLE_PEAK) === EBUR128_MODE_SAMPLE_PEAK) {
        this.updateSamplePeak(src, src_index, frames);
    }

    if ((this.mode & EBUR128_MODE_TRUE_PEAK) === EBUR128_MODE_TRUE_PEAK) {
        this.updateTruePeak(src, src_index, frames);
    }

    this.updateAudioData(src, src_index, frames);
};

Ebur128.prototype.calc_gating_block = function(frames_per_block, optional_output) {
    var sum = 0;
    var audio_data_index = this.audio_data_index;
    var audio_data_frames = this.audio_data_frames;

    for (var c = 0; c < this.channels; ++c) {
        if (this.channel_map[c] === EBUR128_UNUSED) continue;
        var channel_sum = 0;
        var channelAudio_data = this.audio_data[c];
        if (audio_data_index < frames_per_block) {
            for (var i = 0; i < audio_data_index; ++i) {
                channel_sum += channelAudio_data[i] * channelAudio_data[i];
            }

            for (var i = audio_data_frames - (frames_per_block - audio_data_index);
                 i < audio_data_frames; ++i) {
                channel_sum += channelAudio_data[i] * channelAudio_data[i];
            }
        } else {
            for (var i = audio_data_index - frames_per_block; i < audio_data_index; ++i) {
                channel_sum += channelAudio_data[i] * channelAudio_data[i];
            }
        }

        if (this.channel_map[c] === EBUR128_LEFT_SURROUND ||
            this.channel_map[c] === EBUR128_RIGHT_SURROUND) {
            channel_sum *= 1.41;
        } else if (this.channel_map[c] === EBUR128_DUAL_MONO) {
            channel_sum *= 2;
        }
        sum += channel_sum;
    }

    sum /= frames_per_block;

    if (optional_output) {
        optional_output.result = sum;
    } else if (sum >= histogram_energy_boundaries[0]) {
        if (this.use_histogram) {
            var index = find_histogram_index(sum);
            this.block_energy_histogram[index] = this.block_energy_histogram[index] + 1;
        } else {
            this.block_list.unshift(sum);
        }
    }
};


Ebur128.prototype.checkSilence = function() {
    var loudness = this.loudness_momentary();
    if (loudness < SILENCE_THRESHOLD) {
        if (this.lastSilenceStarted === -1) {
            this.lastSilenceStarted = this.currentTime;
        }
    } else if (this.lastSilenceStarted !== -1) {
        if (this.lastSilenceStarted === 0)  {
            this.beginSilenceLength = this.currentTime;
        }
        this.lastSilenceStarted = -1;
    }
};

Ebur128.prototype.checkEndSilence = function() {
    if (this.lastSilenceStarted !== -1) {
        this.endSilenceLength = this.currentTime - this.lastSilenceStarted;
        this.lastSilenceStarted = -1;
    }
};

Ebur128.prototype.energy_shortterm = function () {
    return this.energy_in_interval(this.samples_in_100ms * 30);
};

Ebur128.prototype.add_frames = function(src, frames) {
    var src_index = 0;
    var originalFrames = frames;

    while (frames > 0) {
        if (frames >= this.needed_frames) {
            this.filter(src, src_index, this.needed_frames);
            src_index += this.needed_frames;
            frames -= this.needed_frames;
            this.audio_data_index += this.needed_frames;

            if ((this.mode & EBUR128_MODE_I) === EBUR128_MODE_I) {
                this.calc_gating_block(this.samples_in_100ms * 4, null);
            }

            if ((this.mode & EBUR128_MODE_LRA) === EBUR128_MODE_LRA) {
                this.short_term_frame_counter += this.needed_frames;
                if (this.short_term_frame_counter === this.samples_in_100ms * 30) {
                    var st_energy = this.energy_shortterm();
                    if (st_energy >= histogram_energy_boundaries[0]) {
                        if (this.use_histogram) {
                            var index = find_histogram_index(st_energy);
                            this.block_energy_histogram[index] = this.block_energy_histogram[index] + 1;
                        } else {
                            this.short_term_block_list.unshift(st_energy);
                        }
                    }
                }
                this.short_term_frame_counter = this.samples_in_100ms * 20;
            }

            this.checkSilence();

            this.currentTime += this.needed_frames;
            this.needed_frames = this.samples_in_100ms;

            if (this.audio_data_index === this.audio_data_frames) {
                this.audio_data_index = 0;
            }
        } else {
            this.filter(src, src_index, frames);
            this.audio_data_index += frames;
            if ((this.mode & EBUR128_MODE_LRA) === EBUR128_MODE_LRA) {
                this.short_term_frame_counter += frames;
            }
            this.checkSilence();
            this.currentTime += frames;
            this.needed_frames -= frames;
            frames = 0;
        }
    }
};

Ebur128.gated_loudness = function(ebur128s) {
    var relative_threshold = 0.0;
    var gated_loudness = 0.0;
    var above_thresh_counter = 0;
    var size = ebur128s.length;

    for (var i = 0; i < size; ++i) {
        if (ebur128s[i] && (ebur128s[i].mode & EBUR128_MODE_I) !== EBUR128_MODE_I) {
            throw new Error("invalid mode");
        }
    }

    for (var i = 0; i < size; ++i) {
        if (!ebur128s[i]) continue;
        if (ebur128s[i].use_histogram) {
            for (var j = 0; j < 1000; ++j) {
                relative_threshold += ebur128s[i].block_energy_histogram[j] * histogram_energies[j];
                above_thresh_counter += ebur128s[i].block_energy_histogram[j];
            }
        } else {
            for (var k = 0; k < ebur128s[i].block_list.length; ++k) {
                ++above_thresh_counter;
                relative_threshold += ebur128s[i].block_list[k];
            }
        }
    }

    if (!above_thresh_counter) {
        return -Infinity;
    }
    relative_threshold /= above_thresh_counter;
    relative_threshold *= relative_gate_factor;
    above_thresh_counter = 0;

    var start_index;
    if (relative_threshold < histogram_energy_boundaries[0]) {
        start_index = 0;
    } else {
        start_index = find_histogram_index(relative_threshold);
        if (relative_threshold > histogram_energies[start_index]) {
            ++start_index;
        }
    }

    for (i = 0; i < size; i++) {
        if (!ebur128s[i]) continue;
        if (ebur128s[i].use_histogram) {
            for (var j = start_index; j < 1000; ++j) {
                gated_loudness += ebur128s[i].block_energy_histogram[j] * histogram_energies[j];
                above_thresh_counter += ebur128s[i].block_energy_histogram[j];
            }
        } else {
            for (var k = 0; k < ebur128s[i].block_list.length; ++k) {
                var it = ebur128s[i].block_list[k];
                if (it >= relative_threshold) {
                    ++above_thresh_counter;
                    gated_loudness += it;
                }
            }
        }
    }

    if (!above_thresh_counter) {
        return -Infinity;
    }

    gated_loudness /= above_thresh_counter;
    return ebur128_energy_to_loudness(gated_loudness);
};

Ebur128.loudness_global = function(ebur128) {
    return Ebur128.gated_loudness([ebur128]);
};

Ebur128.loudness_global_multiple = function(ebur128s) {
    return Ebur128.gated_loudness(ebur128s);
};

Ebur128.prototype.energy_in_interval = function(interval_frames) {
    if (interval_frames > this.audio_data_frames) {
        throw new Error("invalid mode");
    }
    var out = {result: 0};
    this.calc_gating_block(interval_frames, out);
    return out.result;
};

Ebur128.prototype.loudness_momentary = function() {
    var energy = this.energy_in_interval(this.samples_in_100ms * 4);
    if (energy <= 0) {
        return -Infinity;
    }
    return ebur128_energy_to_loudness(energy);
};

Ebur128.prototype.loudness_shortterm = function() {
    var energy = this.energy_shortterm();
    if (energy <= 0) {
        return -Infinity;
    }
    return ebur128_energy_to_loudness(energy);
};

Ebur128.prototype.getSamplePeak = function() {
    if ((this.mode & EBUR128_MODE_SAMPLE_PEAK) !== EBUR128_MODE_SAMPLE_PEAK) {
        throw new Error("Wrong mode");
    }
    var ret = new Array(this.channels);
    for (var c = 0; c < ret.length; ++c) {
        ret[c] = this.sample_peak[c];
    }
    return ret;
};

Ebur128.prototype.getTruePeak = function() {
    if ((this.mode & EBUR128_MODE_TRUE_PEAK) !== EBUR128_MODE_TRUE_PEAK) {
        throw new Error("Wrong mode");
    }
    var ret = new Array(this.channels);
    for (var c = 0; c < ret.length; ++c) {
        ret[c] = Math.max(this.true_peak[c], this.sample_peak[c]);
    }
    return ret;
};

Ebur128.prototype.getSilence = function() {
    this.checkEndSilence();
    return {
        beginSilenceLength: this.beginSilenceLength / this.samplerate,
        endSilenceLength: this.endSilenceLength / this.samplerate
    };
};

Ebur128.prototype.loudness_global = function() {
    return Ebur128.loudness_global(this);
};

const SERIALIZATION_VERSION = 1;
Ebur128.prototype.serialize = function() {
    var headerSize = 8 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4;
    var totalSize = headerSize + this.block_list.length * 4;

    var truePeak = (this.mode & EBUR128_MODE_TRUE_PEAK) === EBUR128_MODE_TRUE_PEAK ? this.getTruePeak() : NaN;
    var samplePeak = (this.mode & EBUR128_MODE_SAMPLE_PEAK) === EBUR128_MODE_SAMPLE_PEAK ? this.getSamplePeak() : NaN;

    if (truePeak) truePeak = Math.max.apply(Math, truePeak);
    if (samplePeak) samplePeak = Math.max.apply(Math, samplePeak);


    var ret = "EBUR128 " + util.int32BEString(SERIALIZATION_VERSION) +
              util.uint32BEString(totalSize) +
              util.uint32BEString(this.mode) +
              util.uint32BEString(this.channels) +
              util.uint32BEString(this.samplerate) +
              util.float32BEString(truePeak) +
              util.float32BEString(samplePeak) +
              util.uint32BEString(this.block_list.length);

    for (var i = 0; i < this.block_list.length; ++i) {
        ret += util.float32BEString(this.block_list[i]);
    }

    return ret;
};

function DeserializedEbur128(serialization) {
    this.use_histogram = false;
    this.mode = util.int32BE(serialization, 16);
    this.channels = util.int32BE(serialization, 20) >>> 0;
    this.samplerate = util.int32BE(serialization, 24 >>> 0);
    this.true_peak = util.float32BE(serialization, 28);
    this.sample_peak = util.float32BE(serialization, 32);
    this.block_list = new Array(util.int32BE(serialization, 36) >>> 0);

    for (var i = 0; i < this.block_list.length; ++i) {
        this.block_list[i] = util.float32BE(serialization, 40 + i * 4);
    }
}

DeserializedEbur128.prototype.getTruePeak = function() {
    return this.true_peak;
};

DeserializedEbur128.prototype.getSamplePeak = function() {
    return this.sample_peak;
};

DeserializedEbur128.prototype.loudness_global = Ebur128.prototype.loudness_global;

module.exports = Ebur128;
