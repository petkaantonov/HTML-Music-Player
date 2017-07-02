import EventEmitter from "events";
import {isAnyInputElement} from "platform/dom/Page";
/* eslint-disable no-unused-vars */
import keyboard from "keyboard";
/* eslint-enable no-unused-vars */
import {inherits} from "util";
const MOD = `mod`;

function KeyboardShortcutContext() {
    this._active = false;
    this._shortCutsMap = {};
}

KeyboardShortcutContext.prototype.getHandlerFor = function(shortcut) {
    return this._shortCutsMap[shortcut];
};

const rshortcut = /^(?:(?:ctrl|alt|meta|shift|mod)\+)*(?: |\+|-|[a-zA-Z0-9]+)$/;
KeyboardShortcutContext.prototype.addShortcut = function(shortcut, handler, options) {
    if (Array.isArray(shortcut)) {
        shortcut.forEach(function(s) {
            this.addShortcut(s, handler, options);
        }, this);
        return;
    }
    if (!rshortcut.test(shortcut)) throw new Error(`invalid shortcut: '${shortcut}'`);
    const split = shortcut.split(`+`);

    if (split.length === 1) {
        const key = split[0];
        if (this._shortCutsMap[key]) {
            throw new Error(`duplicate shortcut for this context: '${shortcut}'`);
        }
        this._shortCutsMap[key] = {
            handler,
            options: Object(options)
        };
        return;
    }
    const key = split.pop();
    split.sort();
    let ctrlModifiers = split;
    let metaModifiers;
    for (let i = 0; i < split.length; ++i) {
        if (split[i] === MOD) {
            ctrlModifiers = split.slice();
            metaModifiers = split.slice();
            ctrlModifiers[i] = `ctrl`;
            metaModifiers[i] = `meta;`;
            break;
        }
    }

    const handlerObj = {
        handler,
        options: Object(options)
    };

    if (ctrlModifiers && ctrlModifiers.length > 0) {
        const s = `${ctrlModifiers.join(`+`)}+${key}`;
        this._shortCutsMap[s] = handlerObj;
    }

    if (metaModifiers && metaModifiers.length > 0) {
        const s = `${metaModifiers.join(`+`)}+${key}`;
        this._shortCutsMap[s] = handlerObj;
    }
};

KeyboardShortcutContext.prototype._activate = function() {
    if (this._active) return;
    this._active = true;
};

KeyboardShortcutContext.prototype._deactivate = function() {
    if (!this._active) return;
    this._active = false;
};

export default function KeyboardShortcuts(deps) {
    EventEmitter.call(this);
    this._page = deps.page;
    this._defaultContext = new KeyboardShortcutContext();
    this._defaultContext._activate();
    this._enabled = true;
    this._activeContext = null;
    this._page.addDocumentListener(`keydown`, this._documentKeyDowned.bind(this), true);

}
inherits(KeyboardShortcuts, EventEmitter);

KeyboardShortcuts.prototype._documentKeyDowned = function(e) {
    if (!this._enabled) return;

    if (isAnyInputElement(e.target) || e.target.tabIndex >= 0 || e.target.isContentEditable) {
        return;
    }

    const mods = [];
    let {key} = e;

    if (e.altKey && key !== `Alt`) mods.push(`alt`);
    if (e.ctrlKey && key !== `Control`) mods.push(`ctrl`);
    if (e.metaKey && key !== `Meta`) mods.push(`meta`);
    if (e.shiftKey && key !== `Shift`) mods.push(`shift`);

    if (mods.length > 0) {
        key = `${mods.join(`+`)}+${key}`;
    }

    let handler = this._defaultContext.getHandlerFor(key);
    let called = false;
    try {
        if (handler) {
            called = true;
            handler.handler.call(this, e);
        }

        if (this._activeContext) {
            handler = this._activeContext.getHandlerFor(key);
            if (handler) {
                called = true;
                handler.handler.call(this, e);
            }
        }
    } finally {
        if (called) {
            e.preventDefault();
        }
    }
};

KeyboardShortcuts.prototype.createContext = function() {
    return new KeyboardShortcutContext();
};

KeyboardShortcuts.prototype.KeyboardShortcutContext = KeyboardShortcutContext;

KeyboardShortcuts.prototype.disable = function() {
    if (!this._enabled) return;
    this._enabled = false;
    this._defaultContext._deactivate();
    if (this._activeContext) this._activeContext._deactivate();
    this.emit(`disable`);
};

KeyboardShortcuts.prototype.enable = function() {
    if (this._enabled) return;
    this._enabled = true;
    this._defaultContext._activate();
    if (this._activeContext) this._activeContext._activate();
    this.emit(`enable`);
};

KeyboardShortcuts.prototype.deactivateContext = function(context) {
    if (!(context instanceof KeyboardShortcutContext)) throw new TypeError(`invalid type`);
    if (this._activeContext === context) {
        this._activeContext._deactivate();
        this._activeContext = null;
    }
};

KeyboardShortcuts.prototype.activateContext = function(context) {
    if (!(context instanceof KeyboardShortcutContext)) throw new TypeError(`invalid type`);
    if (this._activeContext) {
        this._activeContext._deactivate();
        this._activeContext = null;
    }
    this._activeContext = context;

    if (this._enabled) {
        this._activeContext._activate();
    }
};

Object.defineProperty(KeyboardShortcuts.prototype, `defaultContext`, {
    get() {
        return this._defaultContext;
    }
});

