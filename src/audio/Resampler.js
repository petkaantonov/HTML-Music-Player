"use strict";
/* Ported from libspeex resampler.c, BSD license follows */
/*
   Copyright (C) 2015 Petka Antonov
   Copyright (C) 2007-2008 Jean-Marc Valin
   Copyright (C) 2008      Thorvald Natvig

   File: resample.c
   Arbitrary resampling code

   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions are
   met:

   1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.

   3. The name of the author may not be used to endorse or promote products
   derived from this software without specific prior written permission.

   THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR
   IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
   OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT,
   INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
   (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
   HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
   STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
   ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
   POSSIBILITY OF SUCH DAMAGE.
*/
const SIZEOF_SPX_WORD = 4;
const STDLIB_MAX_INT = 2147483647;

const kaiser12_table = new Float64Array([
    0.99859849, 1.00000000, 0.99859849, 0.99440475, 0.98745105, 0.97779076,
    0.96549770, 0.95066529, 0.93340547, 0.91384741, 0.89213598, 0.86843014,
    0.84290116, 0.81573067, 0.78710866, 0.75723148, 0.72629970, 0.69451601,
    0.66208321, 0.62920216, 0.59606986, 0.56287762, 0.52980938, 0.49704014,
    0.46473455, 0.43304576, 0.40211431, 0.37206735, 0.34301800, 0.31506490,
    0.28829195, 0.26276832, 0.23854851, 0.21567274, 0.19416736, 0.17404546,
    0.15530766, 0.13794294, 0.12192957, 0.10723616, 0.09382272, 0.08164178,
    0.07063950, 0.06075685, 0.05193064, 0.04409466, 0.03718069, 0.03111947,
    0.02584161, 0.02127838, 0.01736250, 0.01402878, 0.01121463, 0.00886058,
    0.00691064, 0.00531256, 0.00401805, 0.00298291, 0.00216702, 0.00153438,
    0.00105297, 0.00069463, 0.00043489, 0.00025272, 0.00013031, 0.0000527734,
    0.00001000, 0.00000000
]);

const kaiser10_table = new Float64Array([
    0.99537781, 1.00000000, 0.99537781, 0.98162644, 0.95908712, 0.92831446,
    0.89005583, 0.84522401, 0.79486424, 0.74011713, 0.68217934, 0.62226347,
    0.56155915, 0.50119680, 0.44221549, 0.38553619, 0.33194107, 0.28205962,
    0.23636152, 0.19515633, 0.15859932, 0.12670280, 0.09935205, 0.07632451,
    0.05731132, 0.04193980, 0.02979584, 0.02044510, 0.01345224, 0.00839739,
    0.00488951, 0.00257636, 0.00115101, 0.00035515, 0.00000000, 0.00000000
]);

const kaiser8_table = new Float64Array([
    0.99635258, 1.00000000, 0.99635258, 0.98548012, 0.96759014, 0.94302200,
    0.91223751, 0.87580811, 0.83439927, 0.78875245, 0.73966538, 0.68797126,
    0.63451750, 0.58014482, 0.52566725, 0.47185369, 0.41941150, 0.36897272,
    0.32108304, 0.27619388, 0.23465776, 0.19672670, 0.16255380, 0.13219758,
    0.10562887, 0.08273982, 0.06335451, 0.04724088, 0.03412321, 0.02369490,
    0.01563093, 0.00959968, 0.00527363, 0.00233883, 0.00050000, 0.00000000
]);

const kaiser6_table = new Float64Array([
    0.99733006, 1.00000000, 0.99733006, 0.98935595, 0.97618418, 0.95799003,
    0.93501423, 0.90755855, 0.87598009, 0.84068475, 0.80211977, 0.76076565,
    0.71712752, 0.67172623, 0.62508937, 0.57774224, 0.53019925, 0.48295561,
    0.43647969, 0.39120616, 0.34752997, 0.30580127, 0.26632152, 0.22934058,
    0.19505503, 0.16360756, 0.13508755, 0.10953262, 0.08693120, 0.06722600,
    0.05031820, 0.03607231, 0.02432151, 0.01487334, 0.00752000, 0.00000000
]);

//const resampler_basic_direct_double_accum = new Float64Array(4);

function QualityMapping(v) {
   this.base_length = v[0] | 0;
   this.oversample = v[1] | 0;
   this.downsample_bandwidth = Math.fround(v[2]);
   this.upsample_bandwidth = Math.fround(v[3]);
   this.table = v[4];
}

const quality_map = [
   [  8,  4, 0.830, 0.860, kaiser6_table], /* Q0 */
   [ 16,  4, 0.850, 0.880, kaiser6_table], /* Q1 */
   [ 32,  4, 0.882, 0.910, kaiser6_table], /* Q2 */  /* 82.3% cutoff ( ~60 dB stop) 6  */
   [ 48,  8, 0.895, 0.917, kaiser8_table], /* Q3 */  /* 84.9% cutoff ( ~80 dB stop) 8  */
   [ 64,  8, 0.921, 0.940, kaiser8_table], /* Q4 */  /* 88.7% cutoff ( ~80 dB stop) 8  */
   [ 80, 16, 0.922, 0.940, kaiser10_table], /* Q5 */  /* 89.1% cutoff (~100 dB stop) 10 */
   [ 96, 16, 0.940, 0.945, kaiser10_table], /* Q6 */  /* 91.5% cutoff (~100 dB stop) 10 */
   [128, 16, 0.950, 0.950, kaiser10_table], /* Q7 */  /* 93.1% cutoff (~100 dB stop) 10 */
   [160, 16, 0.960, 0.960, kaiser10_table], /* Q8 */  /* 94.5% cutoff (~100 dB stop) 10 */
   [192, 32, 0.968, 0.968, kaiser12_table], /* Q9 */  /* 95.5% cutoff (~100 dB stop) 10 */
   [256, 32, 0.975, 0.975, kaiser12_table] /* Q10 */ /* 96.6% cutoff (~100 dB stop) 10 */
].map(function(v) {
    return new QualityMapping(v);
});

/*8,24,40,56,80,104,128,160,200,256,320*/
const computeFunc_interp = new Float64Array(4);
const computeFunc = function(x, table) {
    var y = x * (table.length - 4);
    var ind = Math.floor(y)|0;
    var frac = (y - ind);
    /* CSE with handle the repeated powers */
    computeFunc_interp[3] =  -0.1666666667 * frac + 0.1666666667 * (frac * frac * frac);
    computeFunc_interp[2] = frac + 0.5 * (frac * frac) - 0.5 * (frac * frac * frac);
    /*computeFunc_interp[2] = 1.f - 0.5f*frac - frac*frac + 0.5f*frac*frac*frac;*/
    computeFunc_interp[0] = -0.3333333333 * frac + 0.5 * (frac * frac) - 0.1666666667 *(frac * frac * frac);
    /* Just to make sure we don't have rounding problems */
    computeFunc_interp[1] = 1 - computeFunc_interp[3] - computeFunc_interp[2] - computeFunc_interp[0];

    /*sum = frac*accum[1] + (1-frac)*accum[2];*/
    return computeFunc_interp[0] * table[ind] +
            computeFunc_interp[1] * table[ind + 1] +
            computeFunc_interp[2] * table[ind + 2] +
            computeFunc_interp[3] * table[ind + 3];
};

/* The slow way of computing a sinc for the table. Should improve that some day */
const sinc = function(cutoff, x, N, table) {
    var fabs = Math.fround(Math.abs(x));
    if (fabs < 1e-6) {
        return cutoff;
    } else if (fabs > 0.5 * N) {
        return 0;
    }
    var xx = Math.fround(x * cutoff);
    /*FIXME: Can it really be any slower than this? */
    return cutoff * Math.sin(Math.PI * xx) / (Math.PI * xx) * computeFunc(Math.fround(Math.abs(2*x/N)), table);
};

var id = 0;
export default function Resampler(nb_channels, in_rate, out_rate, quality) {
    if (quality === undefined) quality = 0;
    this.id = id++;
    this.initialised = 0;
    this.started = false;
    this.in_rate = 0;
    this.out_rate = 0;
    this.num_rate = 0;
    this.den_rate = 0;
    this.quality = -1;
    this.sinc_table_length = 0;
    this.mem_alloc_size = 0;
    this.filt_len = 0;
    this.mem = null;
    this.cutoff = Math.fround(1);
    this.nb_channels = nb_channels;
    this.in_stride = 1;
    this.out_stride = 1;
    this.buffer_size = 160;
    this.last_sample = new Int32Array(this.nb_channels);
    this.magic_samples = new Uint32Array(this.nb_channels);
    this.samp_frac_num = new Uint32Array(this.nb_channels);
    this.int_advance = 0;
    this.frac_advance = 0;
    this.oversample = 0;
    this.sinc_table = null;
    this.sinc_table_length = 0;

    this.setQuality(quality);
    this.setRateFrac(in_rate, out_rate, in_rate, out_rate);
    this._updateFilter();

    this.initialised = 1;
}

Resampler.prototype.setQuality = function(quality) {
    quality = quality|0;
    if (quality > 10 || quality < 0 || !isFinite(quality)) {
        throw new Error("bad quality value");
    }
    if (this.quality === quality) return;
    this.quality = quality;
    if (this.initialised) this._updateFilter();
};

Resampler.prototype.setRateFrac = function(ratio_num, ratio_den, in_rate, out_rate) {
    if (arguments.length <= 2) {
        in_rate = ratio_num;
        out_rate = ratio_den;
    }
    in_rate = in_rate|0;
    out_rate = out_rate|0;
    ratio_num = ratio_num|0;
    ratio_den = ratio_den|0;

    if (in_rate <= 0 || out_rate <= 0 || ratio_num <= 0 || ratio_den <= 0) {
        throw new Error("invalid params");
    }

    var fact;
    var old_den;
    var i;

    if (this.in_rate === in_rate &&
        this.out_rate === out_rate &&
        this.num_rate === ratio_num &&
        this.den_rate === ratio_den) {
        return;
    }

    old_den = this.den_rate;
    this.in_rate = in_rate;
    this.out_rate = out_rate;
    this.num_rate = ratio_num;
    this.den_rate = ratio_den;

    /* FIXME: This is terribly inefficient, but who cares (at least for now)? */
    for (fact = 2; fact <= Math.min(this.num_rate, this.den_rate); fact++) {
        while ((this.num_rate % fact === 0) && (this.den_rate % fact === 0)) {
            this.num_rate /= fact;
            this.den_rate /= fact;
        }
    }

    if (old_den > 0) {
        for (i = 0; i < this.nb_channels; i++) {
            this.samp_frac_num[i] = this.samp_frac_num[i] * this.den_rate / old_den;
            /* Safety net */
            if (this.samp_frac_num[i] >= this.den_rate) {
                this.samp_frac_num[i] = this.den_rate - 1;
            }
        }
    }

    if (this.initialised) this._updateFilter();
};

Resampler.prototype._updateFilter = function() {
   var old_length = this.filt_len;
   var old_alloc_size = this.mem_alloc_size;
   var min_sinc_table_length;
   var min_alloc_size;

   this.int_advance = (this.num_rate / this.den_rate) | 0;
   this.frac_advance = (this.num_rate % this.den_rate) | 0;
   this.oversample = quality_map[this.quality].oversample;
   this.filt_len = quality_map[this.quality].base_length;

    if (this.num_rate > this.den_rate) {
        /* down-sampling */
        this.cutoff = Math.fround(quality_map[this.quality].downsample_bandwidth * this.den_rate / this.num_rate);
        /* FIXME: divide the numerator and denominator by a certain amount if they're too large */
        this.filt_len = (this.filt_len * this.num_rate / this.den_rate) >>> 0;
        /* Round up to make sure we have a multiple of 8 for SSE */
        this.filt_len = (((this.filt_len - 1) & (~0x7)) + 8) >>> 0;

        if (2 * this.den_rate < this.num_rate) {
            this.oversample >>= 1;
        }

        if (4 * this.den_rate < this.num_rate) {
            this.oversample >>= 1;
        }

        if (8 * this.den_rate < this.num_rate) {
            this.oversample >>= 1;
        }

        if (16 * this.den_rate < this.num_rate) {
            this.oversample >>= 1;
        }

        if (this.oversample < 1) {
            this.oversample = 1;
        }
    } else {
    /* up-sampling */
        this.cutoff = quality_map[this.quality].upsample_bandwidth;
    }

    if (STDLIB_MAX_INT / SIZEOF_SPX_WORD / this.den_rate < this.filt_len) {
        throw new Error("INT_MAX/sizeof(spx_word16_t)/this.den_rate < this.filt_len");
    }

    var min_sinc_table_length = this.filt_len * this.den_rate;

    if (this.sinc_table_length < min_sinc_table_length) {
        this.sinc_table = new Float32Array(min_sinc_table_length);
        this.sinc_table_length = min_sinc_table_length;
    }

    var table = quality_map[this.quality].table;
    for (var i = 0; i < this.den_rate; ++i) {
        for (var j = 0; j < this.filt_len; ++j) {
            var index = i * this.filt_len + j;
            var x = Math.fround(j - ((this.filt_len / 2)|0) + 1) - Math.fround(i / this.den_rate);
            this.sinc_table[index] = sinc(this.cutoff, x, this.filt_len, table);
        }
    }

    /* Here's the place where we update the filter memory to take into account
      the change in filter length. It's probably the messiest part of the code
      due to handling of lots of corner cases. */

    /* Adding buffer_size to filt_len won't overflow here because filt_len
      could be multiplied by sizeof(spx_word16_t) above. */
    min_alloc_size = this.filt_len - 1 + this.buffer_size;
    if (min_alloc_size > this.mem_alloc_size) {
        if (STDLIB_MAX_INT / SIZEOF_SPX_WORD / this.nb_channels < min_alloc_size) {
            throw new Error("INT_MAX/sizeof(spx_word16_t)/this.nb_channels < min_alloc_size");
        }
        this.mem = new Float32Array(this.nb_channels * min_alloc_size);
        this.mem_alloc_size = min_alloc_size;
    }

    if (this.initialised) {
        if (this.filt_len > old_length) {
            /* Increase the filter length */
            /*speex_warning("increase filter size");*/
            for (var i = this.nb_channels; (i--) !== 0;) {
                var j;
                var olen = old_length;
                if (this.magic_samples[i] !== 0) {
                    /* Try and remove the magic samples as if nothing had happened */
                    /* FIXME: This is wrong but for now we need it to avoid going over the array bounds */
                    olen = old_length + 2 * this.magic_samples[i];
                    for (j = old_length - 1 + this.magic_samples[i]; (j--) !== 0; ) {
                        this.mem[i * this.mem_alloc_size + j + this.magic_samples[i]] = this.mem[i * old_alloc_size+j];
                    }
                    for (j = 0; j < this.magic_samples[i]; j++) {
                        this.mem[i * this.mem_alloc_size + j] = 0;
                    }
                    this.magic_samples[i] = 0;
                }

                if (this.filt_len > olen) {
                    /* If the new filter length is still bigger than the "augmented" length */
                    /* Copy data going backward */
                    for (j = 0; j < olen - 1; j++) {
                        this.mem[i * this.mem_alloc_size + (this.filt_len - 2 - j)] =
                                this.mem[i * this.mem_alloc_size + (olen - 2 - j)];
                    }
                    /* Then put zeros for lack of anything better */
                    for (; j < this.filt_len - 1; j++) {
                        this.mem[i * this.mem_alloc_size + (this.filt_len - 2 - j)] = 0;
                    }
                    /* Adjust last_sample */
                    this.last_sample[i] += (((this.filt_len - olen) / 2)|0);
                } else {
                    /* Put back some of the magic! */
                    this.magic_samples[i] = (((olen - this.filt_len) / 2)|0);
                    for (j = 0; j < this.filt_len - 1 + this.magic_samples[i]; j++) {
                        this.mem[i * this.mem_alloc_size + j] =
                            this.mem[i * this.mem_alloc_size + j + this.magic_samples[i]];
                    }
                }
            }
        } else if (this.filt_len < old_length) {
            /* Reduce filter length, this a bit tricky. We need to store some of the memory as "magic"
            samples so they can be used directly as input the next time(s) */
            for (var i = 0; i < this.nb_channels; i++) {
                var old_magic = this.magic_samples[i];
                this.magic_samples[i] = ((old_length - this.filt_len) / 2)|0;
                /* We must copy some of the memory that's no longer used */
                /* Copy data going backward */
                for (var j = 0; j < this.filt_len - 1 + this.magic_samples[i] + old_magic; j++) {
                    this.mem[i * this.mem_alloc_size + j] =
                        this.mem[i * this.mem_alloc_size + j + this.magic_samples[i]];
                }
                this.magic_samples[i] += old_magic;
            }
        }
    }
};

const ALLOCATION_SIZE = 1024 * 1024;
const bufferCache = new Array(6);
const getBuffer = function(index, samples) {
    if (bufferCache[index] === undefined) {
        bufferCache[index] = new ArrayBuffer(ALLOCATION_SIZE);
    }
    return new Float32Array(bufferCache[index], 0, samples);
};

Resampler.prototype.end = function() {
    if (!this.started) throw new Error("not started");
    this.started = false;

    for (var i = 0; i < this.nb_channels; ++i) {
        this.last_sample[i] = 0;
        this.magic_samples[i] = 0;
        this.samp_frac_num[i] = 0;
    }

    if (this.mem) {
        for (var i = 0; i < this.mem.length; ++i) {
            this.mem[i] = 0;
        }
    }
};

Resampler.prototype.start = function() {
    if (this.started) throw new Error("already started");
    this.started = true;
};

Resampler.prototype.getLength = function(length) {
    return Math.ceil((length * this.den_rate) / this.num_rate)|0;
};

Resampler.prototype.resample = function(channels, length, output) {
    if (channels.length !== this.nb_channels) throw new Error("input doesn't have expected channel count");
    if (!this.started) throw new Error("start() not called");
    if (length == null) length = channels[0].length;

    const outLength = this.getLength(length);

    if (output == null) {
        output = new Array(channels.length);
        for (var ch = 0; ch < channels.length; ++ch) {
            output[ch] = getBuffer(ch, outLength);
        }
    }

    for (var ch = 0; ch < channels.length; ++ch) {
        this._processFloat(ch, channels[ch], length, output[ch]);
    }
    return output;
};

const process_ref = {out_ptr: 0, out_len: 0, in_len: 0, in_ptr: 0, out_values: null};
Resampler.prototype._processFloat = function(channel_index, inSamples, inLength, outSamples) {
    var in_ptr = 0;
    var out_ptr = 0;
    var ilen = inLength;
    var olen = outSamples.length;
    var x_ptr = channel_index * this.mem_alloc_size;

    const filt_offs = this.filt_len - 1;
    const xlen = this.mem_alloc_size - filt_offs;
    const istride = this.in_stride;
    const mem_values = this.mem;

    process_ref.out_values = outSamples;
    process_ref.out_ptr = out_ptr;

    if (this.magic_samples[channel_index] !== 0) {
        olen -= this._resamplerMagic(channel_index, olen);
    }
    out_ptr = process_ref.out_ptr;

    if (this.magic_samples[channel_index] === 0) {
        while (ilen > 0 && olen > 0) {
            var ichunk = (ilen > xlen) ? xlen : ilen;
            var ochunk = olen;

            for (var j = 0; j < ichunk; ++j) {
                mem_values[x_ptr + j + filt_offs] = inSamples[in_ptr + j * istride];
            }

            process_ref.in_len = ichunk;
            process_ref.out_ptr = out_ptr;
            process_ref.out_len = ochunk;
            this._processNative(channel_index);
            ichunk = process_ref.in_len;
            ochunk = process_ref.out_len;

            ilen -= ichunk;
            olen -= ochunk;
            out_ptr += ochunk * this.out_stride;
            in_ptr += ichunk * istride;
        }
    }
};

Resampler.prototype._processNative = function(channel_index) {
    const N = this.filt_len;
    const mem_ptr = channel_index * this.mem_alloc_size;
    const mem_values = this.mem;
    var out_sample = this._resamplerBasicDirectSingle(channel_index);
    var in_len = process_ref.in_len;
    var out_len = process_ref.out_len;

    if (this.last_sample[channel_index] < in_len) {
        in_len = this.last_sample[channel_index];
        process_ref.in_len = in_len;
    }
    out_len = out_sample;
    process_ref.out_len = out_len;
    this.last_sample[channel_index] -= in_len;

    const ilen = in_len;
    for (var j = 0; j < N - 1; ++j) {
        mem_values[mem_ptr + j] = mem_values[mem_ptr + j + ilen];
    }
};

Resampler.prototype._resamplerMagic = function(channel_index, out_len) {
    var tmp_in_len = this.magic_samples[channel_index];
    var mem_ptr = this.mem_alloc_size + channel_index;
    const N = this.filt_len;

    process_ref.out_len = out_len;
    process_ref.in_len = tmp_in_len;
    this._processNative(channel_index);
    out_len = process_ref.out_len;
    tmp_in_len = process_ref.in_len;

    this.magic_samples[channel_index] -= tmp_in_len;

    const magicSamplesLeft = this.magic_samples[channel_index];

    if (magicSamplesLeft !== 0) {
        var mem = this.mem;
        for (var i = 0; i < magicSamplesLeft; ++i) {
            mem[mem_ptr + N - 1 + i] = mem[mem_ptr + N - 1 + i + tmp_in_len];
        }
    }
    process_ref.out_ptr = process_ref.out_ptr + out_len * this.out_stride;
    return out_len;
};

Resampler.prototype._resamplerBasicDirectSingle = function(channel_index) {
    const N = this.filt_len;
    var out_sample = 0;
    var last_sample = this.last_sample[channel_index];
    var samp_frac_num = this.samp_frac_num[channel_index];
    const sinc_table = this.sinc_table;
    const out_stride = this.out_stride;
    const int_advance = this.int_advance;
    const frac_advance = this.frac_advance;
    const den_rate = this.den_rate;
    const mem_ptr = channel_index * this.mem_alloc_size;
    const mem_values = this.mem;

    var in_len = process_ref.in_len;
    var out_len = process_ref.out_len;

    const out_ptr = process_ref.out_ptr;
    const out_values = process_ref.out_values;

    while (!(last_sample >= in_len || out_sample >= out_len)) {
        var sinct_ptr = samp_frac_num * N;
        var iptr = process_ref.in_ptr + last_sample;

        var a1 = Math.fround(0);
        var a2 = Math.fround(0);
        var a3 = Math.fround(0);
        var a4 = Math.fround(0);

        for (var j = 0; j < N; j += 4) {
            a1 += Math.fround(sinc_table[sinct_ptr + j] * mem_values[mem_ptr + iptr + j]);
            a2 += Math.fround(sinc_table[sinct_ptr + j + 1] * mem_values[mem_ptr + iptr + j + 1]);
            a3 += Math.fround(sinc_table[sinct_ptr + j + 2] * mem_values[mem_ptr + iptr + j + 2]);
            a4 += Math.fround(sinc_table[sinct_ptr + j + 3] * mem_values[mem_ptr + iptr + j + 3]);
        }

        out_values[out_ptr + Math.imul(out_stride, out_sample++)] =
            Math.fround(a1 + Math.fround(a2 + Math.fround(a3 + a4)));
        last_sample += int_advance;
        samp_frac_num += frac_advance;

        if (samp_frac_num >= den_rate) {
            samp_frac_num -= den_rate;
            last_sample++;
        }
    }

    this.last_sample[channel_index] = last_sample;
    this.samp_frac_num[channel_index] = samp_frac_num;
    return out_sample;
};
