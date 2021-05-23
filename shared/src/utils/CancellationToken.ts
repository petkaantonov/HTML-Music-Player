import { Class } from "shared/types/helpers";

export class CancellationError extends Error {}

export interface CancellationTokenOpts {
    cancellationToken: CancellationToken<any>;
}

export class CancellationToken<T extends object | (() => number)> {
    _idProvider: T;
    _fieldName: keyof T | undefined;
    _currentId: number;
    _signalPromiseResolve: null | ((value: unknown) => void);
    _signalPromise: Promise<unknown>;
    constructor(idProvider: T, fieldName?: keyof T) {
        this._idProvider = idProvider;
        this._fieldName = fieldName || undefined;
        this._currentId = this._getId();
        this._signalPromiseResolve = null;
        this._signalPromise = new Promise(resolve => {
            this._signalPromiseResolve = resolve;
        });
    }

    _getId() {
        if (typeof this._idProvider === "function") {
            return (this._idProvider as () => number)();
        } else {
            return (this._idProvider[this._fieldName!] as unknown) as number;
        }
    }

    isCancelled() {
        return this._currentId !== this._getId();
    }

    getSignal() {
        return this._signalPromise;
    }

    signal() {
        if (this._signalPromiseResolve) {
            this._signalPromiseResolve(undefined);
            this._signalPromiseResolve = null;
        }
    }

    check() {
        if (this.isCancelled()) {
            throw new CancellationError(`CancellationToken ${this._fieldName} signaled`);
        }
    }
}

type MapCancellationTokenForOperationName<T extends object> = {
    [K in keyof T as `cancellationTokenFor${Capitalize<string & K>}`]: <
        M extends object | (() => number)
    >() => CancellationToken<M>;
};
type MapCancelAllOperationName<T> = {
    [K in keyof T as `cancelAll${Capitalize<string & K>}s`]: () => void;
};
type MapFieldNames<T> = {
    [K in keyof T as `__${string & K}CancelId`]: number;
};

export default function CancellableOperations<K extends object>(
    SuperClass: null,
    ...operationNames: (keyof K)[]
): Class<MapFieldNames<K> & MapCancelAllOperationName<K> & MapCancellationTokenForOperationName<K>>;
export default function CancellableOperations<T extends new (...args: any) => any, K extends object>(
    SuperClass: { new (...args: ConstructorParameters<T>): T },
    ...operationNames: (keyof K)[]
): Class<MapFieldNames<K> & MapCancelAllOperationName<K> & MapCancellationTokenForOperationName<K>>;

export default function CancellableOperations(SuperClass: Class<any> | null, ...operationNames: any[]): any {
    const superClassName = SuperClass ? SuperClass.name || SuperClass.constructor.name || `SuperClass` : null;
    const superCall = SuperClass ? `super();\n` : ``;
    const extendsClause = SuperClass ? ` extends ${superClassName}` : ``;

    const operationNameFields = operationNames.map(operationName => `this.__${operationName}CancelId = 0;`).join(`\n`);

    const methods = operationNames
        .map(operationName => {
            let camelCase = operationName.replace(/^_+/, ``);
            camelCase = camelCase.charAt(0).toUpperCase() + camelCase.slice(1);

            return `
            cancellationTokenFor${camelCase}() {
                this.__${operationName}CancelId++;
                return new CancellationToken(this, "__${operationName}CancelId");
            }

            cancelAll${camelCase}s() {
                this.__${operationName}CancelId++;
            }
        `;
        })
        .join(`\n`);

    const code = `return class CancellableOperations${extendsClause} {
        constructor() {
            ${superCall}
            ${operationNameFields}
        }

        ${methods}
    }`;

    if (typeof superClassName === "string") {
        return new Function(`CancellationToken`, superClassName, code)(CancellationToken, SuperClass);
    } else {
        return new Function(`CancellationToken`, code)(CancellationToken);
    }
}
