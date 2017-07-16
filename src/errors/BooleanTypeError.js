export default class BooleanTypeError extends TypeError {
    constructor(name, value) {
        super(`${name} must be a boolean but it was ${typeof value}(${{}.toString.call(value)})`);
    }
}

export function checkBoolean(name, value) {
    if (typeof value !== `boolean`) {
        throw new BooleanTypeError(name, value);
    }
}
