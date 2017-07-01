export class CancellationError extends Error {}

export class CancellationToken {
    constructor(idProvider, fieldName) {
        this._idProvider = idProvider;
        this._fieldName = fieldName || null;
        this._currentId = this._getId();
    }

    _getId() {
        if (this._fieldName) {
            return this._idProvider[this._fieldName];
        } else {
            return this._idProvider();
        }
    }

    isCancelled() {
        return this._currentId !== this._getId();
    }

    check() {
        if (this.isCancelled()) {
            throw new CancellationError(`aborted`);
        }
    }
}

export default function CancellableOperations(superClass, ...operationNames) {
    const superClassName = superClass ? (superClass.name || superClass.constructor.name || `SuperClass`) : null;
    const superCall = superClass ? `super();\n` : ``;
    const extendsClause = superClass ? ` extends ${superClassName}` : ``;

    const operationNameFields = operationNames.map(operationName => `this.__${operationName}CancelId = 0;`).join(`\n`);

    const methods = operationNames.map((operationName) => {
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
    }).join(`\n`);

    const code = `return class CancellableOperations${extendsClause} {
        constructor() {
            ${superCall}
            ${operationNameFields}
        }

        ${methods}
    }`;

    if (superClass) {
        return new Function(`CancellationToken`, superClassName, code)(CancellationToken, superClass);
    } else {
        return new Function(`CancellationToken`, code)(CancellationToken);
    }
}
