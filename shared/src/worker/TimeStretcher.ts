// Ported from Chromium
// (https://chromium.googlesource.com/chromium/chromium/+/51ed77e3f37a9a9b80d6d0a8259e84a8ca635259/media/filters/audio_renderer_algorithm.cc)
//
// Copyright 2021 The Chromium Authors. All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//    * Redistributions of source code must retain the above copyright
// notice, this list of conditions and the following disclaimer.
//    * Redistributions in binary form must reproduce the above
// copyright notice, this list of conditions and the following disclaimer
// in the documentation and/or other materials provided with the
// distribution.
//    * Neither the name of Google Inc. nor the names of its
// contributors may be used to endorse or promote products derived from
// this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

import CircularAudioBuffer from "./CircularAudioBuffer";

const SEARCH_INTERVAL_SECONDS = 0.03;
const WINDOW_SIZE_SECONDS = 0.02;

const alloced: Record<number, Float32Array> = {};

function allocF32(size: number) {
    if (!alloced[size]) {
        alloced[size] = new Float32Array(size);
        return alloced[size];
    }
    return alloced[size];
}

export interface TimeStretcherOpts {
    channelCount: number;
    sampleRate: number;
    playbackRate: number;
}

export default class TimeStretcher extends CircularAudioBuffer {
    private outputTime: number = 0;
    private playbackRate: number;
    private candidateFrames: number;
    private windowSize: number;
    private window: Float32Array;
    private transitionWindow: Float32Array;
    private output: Float32Array;
    private search: Float32Array;
    private target: Float32Array;
    private optimal: Float32Array;
    private targetIndexFrames: number = 0;
    private searchIndexFrames: number = 0;
    private hopSize: number;
    private completeFrames: number;
    private searchCenterOffset: number;
    private searchSizeFrames: number;

    constructor(sab: SharedArrayBuffer, { channelCount, sampleRate, playbackRate }: TimeStretcherOpts) {
        super(sab, channelCount);
        this.playbackRate = playbackRate;
        this.candidateFrames = Math.round(SEARCH_INTERVAL_SECONDS * sampleRate);
        this.windowSize = Math.round(WINDOW_SIZE_SECONDS * sampleRate);
        if (this.windowSize % 2 !== 0) {
            this.windowSize++;
        }
        this.completeFrames = 0;
        this.hopSize = this.windowSize / 2;
        this.output = new Float32Array((this.windowSize + this.hopSize) * channelCount);
        this.searchCenterOffset = this.candidateFrames / 2 + (this.windowSize / 2 - 1);
        this.searchSizeFrames = this.candidateFrames + (this.windowSize - 1);
        this.search = new Float32Array(this.searchSizeFrames * channelCount);
        this.target = new Float32Array(this.windowSize * channelCount);
        this.window = new Float32Array(this.windowSize);
        this.transitionWindow = new Float32Array(this.windowSize * 2);
        this.optimal = new Float32Array(this.windowSize * channelCount);
        this._fillWindow(this.window);
        this._fillWindow(this.transitionWindow);
    }

    get readableAudioBufferFrames() {
        const readIndex = Atomics.load(this.readPtr, 0);
        const writeIndex = Atomics.load(this.writePtr, 0);
        const { capacity } = this;
        return (
            (writeIndex >= readIndex ? writeIndex - readIndex : capacity - readIndex + writeIndex) / this.channelCount
        );
    }

    reset() {
        this.completeFrames = 0;
        this.targetIndexFrames = 0;
        this.searchIndexFrames = 0;
        this.outputTime = 0;
        this.output.fill(0);
    }

    read(channels: Float32Array[], frames: number): number {
        if (Atomics.load(this.writerClearing, 0) === 1) {
            return -1;
        }
        Atomics.store(this.readerProcessingSamples, 0, 1);

        let renderedFrames: number = 0;
        if (this.playbackRate === 1) {
            renderedFrames = super.read(channels, frames);
        } else {
            do {
                renderedFrames += this.writeCompletedFramesTo(frames - renderedFrames, renderedFrames, channels);
            } while (renderedFrames < frames && this.iterate(this.playbackRate));
        }

        Atomics.store(this.readerProcessingSamples, 0, 0);
        Atomics.notify(this.readerProcessingSamples, 0, 1);
        return renderedFrames;
    }

    canIterate() {
        const { readableAudioBufferFrames, windowSize, targetIndexFrames, searchIndexFrames, searchSizeFrames } = this;
        return (
            targetIndexFrames + windowSize <= readableAudioBufferFrames &&
            searchIndexFrames + searchSizeFrames <= readableAudioBufferFrames
        );
    }

    iterate(playbackRate: number): boolean {
        if (!this.canIterate()) {
            return false;
        }
        this.getOptimalBlock();
        const { channelCount, completeFrames, hopSize, output, window, optimal } = this;

        for (let c = 0; c < channelCount; ++c) {
            for (let n = 0; n < hopSize; ++n) {
                output[(n + completeFrames) * channelCount + c] =
                    output[(n + completeFrames) * channelCount + c] * window[hopSize + n] +
                    optimal[n * channelCount + c] * window[n];
                output[(n + completeFrames + hopSize) * channelCount + c] = optimal[(n + hopSize) * channelCount + c];
            }
        }
        this.completeFrames += hopSize;
        this.updateOutputTime(playbackRate, this.hopSize);
        this.removeOldInputFrames(playbackRate);
        return true;
    }

    updateOutputTime(playbackRate: number, timeChange: number) {
        this.outputTime += timeChange;
        const searchCenterIndex = (this.outputTime * playbackRate + 0.5) | 0;
        this.searchIndexFrames = searchCenterIndex - this.searchCenterOffset;
    }

    removeOldInputFrames(playbackRate: number) {
        const earliestUsedIndex = Math.min(this.targetIndexFrames, this.searchIndexFrames);
        if (earliestUsedIndex <= 0) {
            return;
        }
        const readIndex = Atomics.load(this.readPtr, 0);
        Atomics.store(this.readPtr, 0, (readIndex + earliestUsedIndex * this.channelCount) % this.capacity);
        this.targetIndexFrames -= earliestUsedIndex;
        const outputTimeChange = earliestUsedIndex / playbackRate;
        this.updateOutputTime(playbackRate, -outputTimeChange);
    }

    getOptimalBlock() {
        const { channelCount, target, optimal, windowSize, transitionWindow } = this;
        let optimalIndexFrames = 0;
        const excludeFrames = 160;
        if (this.targetIsWithinSearchRegion()) {
            optimalIndexFrames = this.targetIndexFrames;
            this.peekAudioWithZeroPrepend(optimalIndexFrames, this.optimal);
        } else {
            this.peekAudioWithZeroPrepend(this.targetIndexFrames, this.target);
            this.peekAudioWithZeroPrepend(this.searchIndexFrames, this.search);
            const lastOptimalFrame = this.targetIndexFrames - this.hopSize - this.searchIndexFrames;
            const excludeInterval: [number, number] = [
                lastOptimalFrame - excludeFrames / 2,
                lastOptimalFrame + excludeFrames / 2,
            ];
            optimalIndexFrames = getOptimalIndex(this.search, this.target, excludeInterval, channelCount);
            optimalIndexFrames += this.searchIndexFrames;

            this.peekAudioWithZeroPrepend(optimalIndexFrames, this.optimal);

            for (let c = 0; c < channelCount; ++c) {
                for (let n = 0; n < windowSize; ++n) {
                    optimal[n * channelCount + c] =
                        optimal[n * channelCount + c] * transitionWindow[n] +
                        target[n * channelCount + c] * transitionWindow[n + windowSize];
                }
            }
        }
        this.targetIndexFrames = optimalIndexFrames + this.hopSize;
    }

    peekAudioWithZeroPrepend(readOffsetFrames: number, data: Float32Array) {
        let writeOffset = 0;
        let framesToRead = data.length / this.channelCount;
        if (readOffsetFrames < 0) {
            const zeroFramesAppended = Math.min(-readOffsetFrames, framesToRead);
            readOffsetFrames = 0;
            framesToRead -= zeroFramesAppended;
            writeOffset = zeroFramesAppended;
            data.fill(0, 0, zeroFramesAppended * this.channelCount);
        }
        this.peekFrames(framesToRead, readOffsetFrames, writeOffset, data);
    }

    targetIsWithinSearchRegion() {
        return (
            this.targetIndexFrames >= this.searchIndexFrames &&
            this.targetIndexFrames + this.windowSize <= this.searchIndexFrames + this.searchSizeFrames
        );
    }

    writeCompletedFramesTo(frames: number, dstOffset: number, input: Float32Array[]) {
        const { channelCount, completeFrames, output } = this;
        const renderedFrames = Math.min(completeFrames, frames);
        if (renderedFrames === 0) {
            return 0;
        }
        for (let c = 0; c < channelCount; ++c) {
            const inputChannel = input[c];
            for (let i = 0; i < renderedFrames; ++i) {
                inputChannel[i + dstOffset] = output[i * channelCount + c];
            }
        }
        const framesToMove = output.length / channelCount - renderedFrames;
        for (let c = 0; c < channelCount; ++c) {
            for (let i = 0; i < framesToMove; ++i) {
                output[i * channelCount + c] = output[(renderedFrames + i) * channelCount + c];
            }
        }
        this.completeFrames -= renderedFrames;
        return renderedFrames;
    }

    _fillWindow(window: Float32Array) {
        const N = window.length;
        const scale = (Math.PI * 2) / N;
        for (let n = 0; n < N; ++n) {
            // Hamming window.
            window[n] = Math.fround(0.5 * Math.fround(1 - Math.fround(Math.cos(n * scale))));
        }
    }

    updatePlaybackRate(rate: number) {
        this.playbackRate = rate;
    }
}

function multiChannelMovingBlockEnergies(
    input: Float32Array,
    targetFrames: number,
    energy: Float32Array,
    channelCount: number
) {
    const blocks = input.length / channelCount - (targetFrames - 1);
    for (let c = 0; c < channelCount; ++c) {
        energy[c] = 0;
        for (let m = 0; m < targetFrames; ++m) {
            const inputSample = input[m * channelCount + c];
            energy[c] += inputSample * inputSample;
        }
        let slideOut = 0;
        let slideIn = targetFrames;
        for (let n = 1; n < blocks; ++n, ++slideIn, ++slideOut) {
            const slideInValue = input[slideIn * channelCount + c];
            const slideOutValue = input[slideOut * channelCount + c];
            energy[c + n * channelCount] =
                energy[c + (n - 1) * channelCount] - slideOutValue * slideOutValue + slideInValue * slideInValue;
        }
    }
}

function multiChannelDotProduct(
    a: Float32Array,
    aOffsetFrames: number,
    b: Float32Array,
    bOffsetFrames: number,
    frameCount: number,
    dotProduct: Float32Array,
    channelCount: number
) {
    for (let c = 0; c < channelCount; ++c) {
        dotProduct[c] = 0;
        for (let n = 0; n < frameCount; ++n) {
            const aValue = a[(aOffsetFrames + n) * channelCount + c];
            const bValue = b[(bOffsetFrames + n) * channelCount + c];
            dotProduct[c] += aValue * bValue;
        }
    }
}

function multiChannelSimilarityMeasure(
    dotProdAB: Float32Array,
    energyA: Float32Array,
    energyB: Float32Array,
    energyBIndex: number,
    channelCount: number
): number {
    const epsilon = 1e-12;
    let similarityMeasure = 0;
    for (let c = 0; c < channelCount; ++c) {
        similarityMeasure += dotProdAB[c] / Math.sqrt(energyA[c] * energyB[c + energyBIndex] + epsilon);
    }
    return similarityMeasure;
}

function inInterval(value: number, interval: [number, number]) {
    return value >= interval[0] && value <= interval[1];
}

const similarity = new Float32Array(3);
const dotProd = new Float32Array(10);
let normalizedCandidateIndex: number = 0;
let candidateSimilarity: number = 0;

function quadraticInterpolation() {
    const a = 0.5 * (similarity[2] + similarity[0]) - similarity[1];
    const b = 0.5 * (similarity[2] - similarity[0]);
    const c = similarity[1];
    if (a === 0) {
        normalizedCandidateIndex = 0;
        candidateSimilarity = similarity[1];
    } else {
        normalizedCandidateIndex = -b / (2 * a);
        candidateSimilarity =
            a * normalizedCandidateIndex * normalizedCandidateIndex + b * normalizedCandidateIndex + c;
    }
}

function decimatedSearch(
    decimation: number,
    excludeIntervalFrames: [number, number],
    target: Float32Array,
    search: Float32Array,
    energyTargets: Float32Array,
    energyCandidateSamples: Float32Array,
    channelCount: number
): number {
    const blockSize = target.length / channelCount;
    const candidateFrames = search.length / channelCount - (blockSize - 1);
    let n = 0;
    multiChannelDotProduct(target, 0, search, n, blockSize, dotProd, channelCount);
    similarity[0] = multiChannelSimilarityMeasure(
        dotProd,
        energyTargets,
        energyCandidateSamples,
        n * channelCount,
        channelCount
    );
    let bestSimilarity = similarity[0];
    let optimalIndex = 0;
    n += decimation;
    if (n >= candidateFrames) {
        return 0;
    }
    multiChannelDotProduct(target, 0, search, n, blockSize, dotProd, channelCount);
    similarity[1] = multiChannelSimilarityMeasure(
        dotProd,
        energyTargets,
        energyCandidateSamples,
        n * channelCount,
        channelCount
    );
    n += decimation;
    if (n >= candidateFrames) {
        return similarity[1] > similarity[0] ? decimation : 0;
    }
    for (; n < candidateFrames; n += decimation) {
        multiChannelDotProduct(target, 0, search, n, blockSize, dotProd, channelCount);
        similarity[2] = multiChannelSimilarityMeasure(
            dotProd,
            energyTargets,
            energyCandidateSamples,
            n * channelCount,
            channelCount
        );
        if (
            (similarity[1] > similarity[0] && similarity[1] >= similarity[2]) ||
            (similarity[1] >= similarity[0] && similarity[1] > similarity[2])
        ) {
            quadraticInterpolation();
            const candidateIndex = n - decimation + ((normalizedCandidateIndex * decimation + 0.5) | 0);
            if (candidateIndex > bestSimilarity && !inInterval(candidateIndex, excludeIntervalFrames)) {
                optimalIndex = candidateIndex;
                bestSimilarity = candidateSimilarity;
            }
        } else if (
            n + decimation >= candidateFrames &&
            similarity[2] >= bestSimilarity &&
            !inInterval(n, excludeIntervalFrames)
        ) {
            optimalIndex = n;
            bestSimilarity = similarity[2];
        }
        similarity[0] = similarity[1];
        similarity[1] = similarity[2];
    }
    return optimalIndex;
}

function fullSearch(
    lowLimit: number,
    highLimit: number,
    excludeIntervalFrames: [number, number],
    target: Float32Array,
    search: Float32Array,
    energyTargets: Float32Array,
    energyCandidateSamples: Float32Array,
    channelCount: number
): number {
    const blockSize = target.length / channelCount;
    let bestSimilarity = Math.fround(1.17549e-38);
    let optimalIndex = 0;
    for (let n = lowLimit; n <= highLimit; ++n) {
        if (inInterval(n, excludeIntervalFrames)) {
            continue;
        }
        multiChannelDotProduct(target, 0, search, n, blockSize, dotProd, channelCount);
        const similarity = multiChannelSimilarityMeasure(
            dotProd,
            energyTargets,
            energyCandidateSamples,
            n * channelCount,
            channelCount
        );
        if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            optimalIndex = n;
        }
    }
    return optimalIndex;
}
function getOptimalIndex(
    search: Float32Array,
    target: Float32Array,
    excludeIntervalFrames: [number, number],
    channelCount: number
): number {
    const targetFrames = target.length / channelCount;
    const candidateFrames = search.length / channelCount - (targetFrames - 1);
    const searchDecimation = 5;
    const energyTargets = allocF32(channelCount);
    const energyCandidateSamples = allocF32(channelCount * candidateFrames);
    multiChannelMovingBlockEnergies(search, targetFrames, energyCandidateSamples, channelCount);
    multiChannelDotProduct(target, 0, target, 0, targetFrames, energyTargets, channelCount);
    const optimalIndex = decimatedSearch(
        searchDecimation,
        excludeIntervalFrames,
        target,
        search,
        energyTargets,
        energyCandidateSamples,
        channelCount
    );
    const lowLimit = Math.max(0, optimalIndex - searchDecimation);
    const highLimit = Math.min(candidateFrames - 1, optimalIndex + searchDecimation);
    return fullSearch(
        lowLimit,
        highLimit,
        excludeIntervalFrames,
        target,
        search,
        energyTargets,
        energyCandidateSamples,
        channelCount
    );
}
