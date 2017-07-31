import {AudioParam} from "platform/platform";

function cancelAndHoldStandardImpl(audioParam, value) {
    return audioParam.cancelAndHoldAtTime(value);
}

function cancelAndHoldNonStandardImpl(audioParam, value) {
    return audioParam.cancelValuesAndHoldAtTime(value);
}

function cancelAndHoldPolyfillImpl(audioParam, value) {
    const currentValue = audioParam.value;
    audioParam.cancelScheduledValues(value);
    audioParam.setValueAtTime(currentValue, value);
}

export const cancelAndHold = typeof AudioParam.prototype.cancelAndHoldAtTime === `function` ? cancelAndHoldStandardImpl :
                              typeof AudioParam.prototype.cancelValuesAndHoldAtTime === `function` ? cancelAndHoldNonStandardImpl :
                              cancelAndHoldPolyfillImpl;
