"use strict";
const copy = function(a, b, length) {
    if (a === b) return a;
    for (var i = 0; i < length; ++i) {
        b[i] = a[i];
    }
    return b;
}

const bufferCache = Object.create(null);
const getBuffer = function(samples) {
    var key = samples + " ";
    var result = bufferCache[key];
    if (!result) {
        result = new Float32Array(samples);
        bufferCache[key] = result;
    } else {
        for (var i = 0; i < result.length; ++i) result[i] = 0;
    }
    return result;
};

export default function ChannelMixer(channels) {
    this.channels = channels;
}

ChannelMixer.prototype.setChannels = function(channels) {
    this.channels = channels;
};

ChannelMixer.prototype.getChannels = function() {
    return this.channels;
};

ChannelMixer.prototype.mix = function(input, length, output) {
    if (length === undefined) length = input[0].length;
    if (output === undefined) output = input;

    const inputChannels = input.length;
    if (inputChannels === this.channels) {
        for (var ch = 0; ch < inputChannels; ++ch) {
            copy(input[ch], output[ch], length);
        }
        return output;
    }

    var outputChannels = this.channels;
    if (outputChannels === 1) {
        if (inputChannels === 2) {
            return this._mix2to1(input, length, output);
        } else if (inputChannels === 4) {
            return this._mix4to1(input, length, output);
        } else if (inputChannels === 6) {
            return this._mix6to1(input, length, output);
        }
    } else if (outputChannels === 2) {
        if (inputChannels === 1) {
            return this._mix1to2(input, length, output);
        } else if (inputChannels === 4) {
            return this._mix4to2(input, length, output);
        } else if (inputChannels === 6) {
            return this._mix6to2(input, length, output);
        }
    } else if (outputChannels === 4) {
        if (inputChannels === 1) {
            return this._mix1to4(input, length, output);
        } else if (inputChannels === 2) {
            return this._mix2to4(input, length, output);
        }   else if (inputChannels === 6) {
            return this._mix6to4(input, length, output);
        }
    } else if (outputChannels === 6) {
        if (inputChannels === 1) {
            return this._mix1to6(input, length, output);
        } else if (inputChannels === 2) {
            return this._mix2to6(input, length, output);
        } else if (inputChannels === 4) {
            return this._mix4to6(input, length, output);
        }
    }

    return this._mixAnyToAny(input, length, output);
};

ChannelMixer.prototype._mix1to2 = function(input) {
    return [input[0], input[0]];
};

ChannelMixer.prototype._mix1to4 = function(input, length, output) {
    var silent = getBuffer(length);
    return [input[0], input[0], silent, silent];
};

ChannelMixer.prototype._mix1to6 = function(input, length, output) {
    var silent = getBuffer(length);
    return [
        silent,
        silent,
        input[0],
        silent,
        silent,
        silent
    ];
};

ChannelMixer.prototype._mix2to1 = function(input, length, output) {
    var ret = output[0];
    for (var i = 0; i < length; ++i) {
        ret[i] = Math.fround(Math.fround(input[0][i] + input[1][i]) / 2);
    }
    return [ret];
};

ChannelMixer.prototype._mix2to4 = function(input, length, output) {
    var silent = getBuffer(length);
    return [copy(input[0], output[0], length), copy(input[1], output[1], length), silent, silent];
};

ChannelMixer.prototype._mix2to6 = function(input, length, output) {
    var silent = getBuffer(length);
    return [copy(input[0], output[0], length),
            copy(input[1], output[1], length), silent, silent, silent, silent];
};

ChannelMixer.prototype._mix4to1 = function(input, length, output) {
    var ret = output[0];
    for (var i = 0; i < length; ++i) {
        ret[i] = (input[0][i] + input[1][i] + input[2][i] + input[3][i]) / 4;
    }
    return [ret];
};

ChannelMixer.prototype._mix4to2 = function(input, length, output) {
    var ret0 = output[0];
    var ret1 = output[1];
    for (var i = 0; i < length; ++i) {
        ret0[i] = (input[0][i] + input[2][i]) / 2;
        ret1[i] = (input[1][i] + input[3][i]) / 2;
    }
    return [ret0, ret1];
};

ChannelMixer.prototype._mix4to6 = function(input, length, output) {
    var silent = getBuffer(length);
    return [copy(input[0], output[0], length),
            copy(input[1], output[1], length),
            silent, silent,
            copy(input[2], output[2], length),
            copy(input[3], output[3], length)];
};


ChannelMixer.prototype._mix6to1 = function(input, length, output) {
    var ret = output[0];

    for (var i = 0; i < length; ++i) {
        var L = input[0][i];
        var R = input[1][i];
        var C = input[2][i];
        var SL = input[4][i];
        var SR = input[5][i];
        ret[i] = Math.fround(0.7071067811865476 * (L + R)) + C + Math.fround(0.5 * (SL + SR));
    }
    return [ret];
};

ChannelMixer.prototype._mix6to2 = function(input, length, output) {
    var ret0 = output[0];
    var ret1 = output[1];

    for (var i = 0; i < length; ++i) {
        var L = input[0][i];
        var R = input[1][i];
        var C = input[2][i];
        var SL = input[4][i];
        var SR = input[5][i];
        ret0[i] = L + Math.fround(0.7071067811865476 * Math.fround(C + SL));
        ret1[i] = R + Math.fround(0.7071067811865476 * Math.fround(C + SR));
    }

    return [ret0, ret1];
};

ChannelMixer.prototype._mix6to4 = function(input, length, output) {
    var ret0 = output[0];
    var ret1 = output[1];
    var ret2 = output[4];
    var ret3 = output[5];

    for (var i = 0; i < length; ++i) {
        var L = input[0][i];
        var R = input[1][i];
        var C = input[2][i];
        ret0[i] = L + Math.fround(0.7071067811865476 * C);
        ret1[i] = R + Math.fround(0.7071067811865476 * C);
    }

    return [ret0, ret1, ret2, ret3];
};

ChannelMixer.prototype._mixAnyToAny = function(input, length, output) {
    var channels = this.channels;

    if (channels < input.length) {
        for (var ch = 0; ch < channels; ++ch) {
            copy(input[ch], output[ch], length);
        }
        return output.slice(0, channels);
    } else if (channels > input.length) {

        for (var ch = 0; ch < channels; ++ch) {
            copy(input[ch], output[ch], length);
        }
        var silent = getBuffer(length);
        for (; ch < input.length; ++ch) {
            output[ch] = silent;
        }
        return output;
    } else {
        for (var ch = 0; ch < channels; ++ch) {
            copy(input[ch], output[ch], length);
        }
        return output;
    }
};
