import EventEmitter from "events";
import {ABOVE_TOOLBAR_Z_INDEX as zIndex} from "ui/ToolbarManager";
import {ALIGN_LEFT_TOP_CORNER as align} from "ui/ActionMenu";

export default class MainMenu extends EventEmitter {
    constructor(opts, deps) {
        super();
        this._menuContext = deps.menuContext;
        this._env = deps.env;

        const menu = [];

        if (this._env.supportsDirectories()) {
            menu.push({
                id: `add-folder`,
                disabled: false,
                content: this._menuContext.createMenuItem(`Add folder`, `material-icons small-material-icon folder`),
                onClick: this._createMenuItemClickedHandler(`addFolder`)
            });
        }

        menu.push({
            id: `add-files`,
            disabled: false,
            content: this._menuContext.createMenuItem(`Add files`, `material-icons small-material-icon insert-drive-file`),
            onClick: this._createMenuItemClickedHandler(`addFiles`)
        });

        menu.push({
            id: `preferences`,
            disabled: false,
            content: this._menuContext.createMenuItem(`Preferences`, `material-icons small-material-icon settings`),
            onClick: this._createMenuItemClickedHandler(`preferences`)
        });

        menu.push({
            id: `effects`,
            disabled: false,
            content: this._menuContext.createMenuItem(`Effects`, `material-icons small-material-icon tune`),
            onClick: this._createMenuItemClickedHandler(`effects`)
        });

        this._menu = this._menuContext.createButtonMenu({
            target: opts.target,
            zIndex,
            menu,
            align
        });
    }

    _createMenuItemClickedHandler(eventName) {
        return (...args) => {
            this.emit(eventName, ...args);
            this._menu.hide();
        };
    }

}
