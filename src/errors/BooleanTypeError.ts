export default class BooleanTypeError extends TypeError {
    constructor(name: string, value: any) {
        super(`${name} must be a boolean but it was ${typeof value}(${{}.toString.call(value)})`);
    }
}

export function checkBoolean(name: string, value: any) {
    if (typeof value !== `boolean`) {
        throw new BooleanTypeError(name, value);
    }
}
