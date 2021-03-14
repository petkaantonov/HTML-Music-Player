function cancelAndHoldStandardImpl(audioParam: AudioParam, value: number) {
    return audioParam.cancelAndHoldAtTime(value);
}

export const cancelAndHold = cancelAndHoldStandardImpl;
