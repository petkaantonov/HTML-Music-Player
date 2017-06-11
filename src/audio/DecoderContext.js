const DEFAULT_BUFFER_LENGTH_SECONDS = 2;

let autoIncrementId = 0;
export default class DecoderContext {
    constructor({targetBufferLengthSeconds}) {
        this._id = autoIncrementId++;
        this._targetBufferLengthSeconds = targetBufferLengthSeconds ||
                                          DEFAULT_BUFFER_LENGTH_SECONDS;
        this._started = false;
        this._channelCount = -1;
        this._sampleRate = -1;
    }

    reinitialized({targetBufferLengthSeconds}) {
        this._targetBufferLengthSeconds = targetBufferLengthSeconds ||
                                          DEFAULT_BUFFER_LENGTH_SECONDS;
        return this;
    }

    get targetAudioFrameCount() {
        return this.targetBufferLengthSeconds * this.sampleRate;
    }

    get channelCount() {
        if (this._channelCount === -1) {
            throw new Error(`channelCount has not been set`);
        }
        return this._channelCount;
    }

    get sampleRate() {
        if (this._sampleRate === -1) {
            throw new Error(`sampleRate has not been set`);
        }
        return this._sampleRate;
    }

    get id() {
        return this._id;
    }

    get targetBufferLengthSeconds() {
        return this._targetBufferLengthSeconds;
    }

    set targetBufferLengthSeconds(val) {
        this._targetBufferLengthSeconds = val;
    }

    hasEstablishedMetadata() {
        return this._channelCount !== -1;
    }

    getCurrentAudioFrame() {
        throw new Error(`Error: getCurrentAudioFrame() not implemented by ${this.constructor.name}`);
    }

    start() {
        if (this._started) throw new Error(`previous decoding in session, call .end()`);
        this._started = true;
    }

    end() {
        if (!this._started) {
            return false;
        }
        this._started = false;
        return true;
    }

    establishChannelCount(channelCount) {
        if (this._channelCount !== -1) {
            throw new Error(`channelCount already established`);
        }
        if (channelCount <= 0) {
            throw new Error(`cannot establish channelCount to invalid value`);
        }
        this._channelCount = channelCount;
    }

    establishSampleRate(sampleRate) {
        if (this._sampleRate !== -1) {
            throw new Error(`sampleRate already established`);
        }
        if (sampleRate <= 0) {
            throw new Error(`cannot establish sampleRate to invalid value`);
        }
        this._sampleRate = sampleRate;
    }

    decodeUntilFlush() {
        if (!this._started) throw new Error(`call .start() before calling decode
                                                ${this.id} ${this.channelCount} ${this.sampleRate}`);
    }

    applySeek() {
        if (!this._started) throw new Error(`cannot apply seek to unstarted context`);
    }

    _flush() {
        throw new Error(`Error: _flush() not implemented by ${this.constructor.name}`);
    }

    _resetState() {
        this._started = false;
        this._channelCount = -1;
        this._sampleRate = -1;
    }

    _error(message = `decoder error`) {
        this._resetState();
        throw new Error(message);
    }
}
