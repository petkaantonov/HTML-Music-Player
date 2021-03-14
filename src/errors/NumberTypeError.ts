export class NumberTypeError extends TypeError {
    constructor(name: string, value: number) {
        super(`${name} must be a number but it was ${typeof value}(${{}.toString.call(value)})`);
    }
}

export class NumberRangeTypeError extends TypeError {
    constructor(name: string, value: number, min: number, max: number) {
        super(`${name} (=${value}) is not in range [${min}, ${max}]`);
    }
}

export class NumberNotDivisibleTypeError extends TypeError {
    constructor(name: string, value: number, divisor: number) {
        super(`${name} (=${value}) is not divisible by ${divisor}`);
    }
}

export class NumberNonFiniteTypeError extends TypeError {
    constructor(name: string, value: number) {
        super(`${name} (=${value}) is not finite`);
    }
}

export class NumberNotIntegerTypeError extends TypeError {
    constructor(name: string, value: number) {
        super(`${name} (=${value}) is not a integer`);
    }
}

export function checkInteger(name: string, value: number) {
    checkNumber(name, value);
    if (Math.round(value) !== value) {
        throw new NumberNotIntegerTypeError(name, value);
    }
}

export function checkFiniteNumber(name: string, value: number) {
    checkNumber(name, value);
    if (!isFinite(value)) {
        throw new NumberNonFiniteTypeError(name, value);
    }
}

export function checkNumber(name: string, value: number) {
    if (typeof value !== `number`) {
        throw new NumberTypeError(name, value);
    }
}

export function checkNumberRange(name: string, value: number, min: number, max: number) {
    checkFiniteNumber(name, value);
    if (!(min <= value && value <= max)) {
        throw new NumberRangeTypeError(name, value, min, max);
    }
}

export function checkNumberDivisible(name: string, value: number, divisor: number, integerMultiplier = 1e9) {
    checkFiniteNumber(name, value);

    const iValue = Math.round(value * integerMultiplier);
    const iDivisor = Math.round(divisor * integerMultiplier);

    if (iValue % iDivisor !== 0) {
        throw new NumberNotDivisibleTypeError(name, value, divisor);
    }
}
