import { EventEmitterInterface } from "shared/types/helpers";
import { SelectDeps } from "ui/Application";
import Env from "ui/platform/Env";
import { ALIGN_LEFT_TOP_CORNER as align, ButtonMenu, MenuItemClickEvent } from "ui/ui/ActionMenu";
import { ABOVE_TOOLBAR_Z_INDEX as zIndex } from "ui/ui/ToolbarManager";
import EventEmitter from "vendor/events";

import MenuContext, { MenuItemSpecList } from "./MenuContext";

type Deps = SelectDeps<"menuContext" | "env">;

interface Opts {
    target: string;
}

interface MainMenuEventsMap {
    addFolder: (e: MenuItemClickEvent) => void;
    addFiles: (e: MenuItemClickEvent) => void;
    preferences: (e: MenuItemClickEvent) => void;
    effects: (e: MenuItemClickEvent) => void;
}

export default interface MainMenu extends EventEmitterInterface<MainMenuEventsMap> {}

export default class MainMenu extends EventEmitter {
    private _menuContext: MenuContext;
    private _env: Env;
    private _menu: ButtonMenu;
    constructor(opts: Opts, deps: Deps) {
        super();
        this._menuContext = deps.menuContext;
        this._env = deps.env;

        const menu: MenuItemSpecList = [];

        if (this._env.supportsDirectories()) {
            menu.push({
                id: `add-folder`,
                disabled: false,
                content: this._menuContext.createMenuItem(`Add folder`, `material-icons small-material-icon folder`),
                onClick: this._createMenuItemClickedHandler(`addFolder`),
            });
        }

        menu.push({
            id: `add-files`,
            disabled: false,
            content: this._menuContext.createMenuItem(
                `Add files`,
                `material-icons small-material-icon insert-drive-file`
            ),
            onClick: this._createMenuItemClickedHandler(`addFiles`),
        });

        menu.push({
            id: `preferences`,
            disabled: false,
            content: this._menuContext.createMenuItem(`Preferences`, `material-icons small-material-icon settings`),
            onClick: this._createMenuItemClickedHandler(`preferences`),
        });

        menu.push({
            id: `effects`,
            disabled: false,
            content: this._menuContext.createMenuItem(`Effects`, `material-icons small-material-icon tune`),
            onClick: this._createMenuItemClickedHandler(`effects`),
        });

        this._menu = this._menuContext.createButtonMenu({
            target: opts.target,
            zIndex,
            menu,
            align,
        });
    }

    _createMenuItemClickedHandler(eventName: keyof MainMenuEventsMap) {
        return (e: MenuItemClickEvent) => {
            this.emit(eventName, e);
            this._menu.hide();
        };
    }
}
