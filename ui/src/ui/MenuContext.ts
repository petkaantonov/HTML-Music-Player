import { slugTitle } from "shared/util";
import Page, { DomWrapper, DomWrapperSelector } from "ui/platform/dom/Page";
import GlobalEvents from "ui/platform/GlobalEvents";
import ActionMenu, {
    ActionMenuItem,
    alignMap,
    ButtonMenu,
    ContextMenu,
    MenuItemClickEvent,
    VirtualButtonMenu,
} from "ui/ui/ActionMenu";

import GestureRecognizerContext from "./gestures/GestureRecognizerContext";
import Rippler from "./Rippler";

export const lessThanAllSelected = function (selectedCount: number, totalCount: number) {
    return selectedCount < totalCount && totalCount > 0;
};

export const exactly1Selected = function (selectedCount: number, totalCount: number) {
    return selectedCount === 1 && totalCount > 0;
};

export const moreThan0Selected = function (selectedCount: number, totalCount: number) {
    return selectedCount > 0 && totalCount > 0;
};

export const moreThan1Selected = function (selectedCount: number, totalCount: number) {
    return selectedCount > 1 && totalCount > 1;
};

export const actionHandler = function (preventDefault: boolean, contentInstance: any, method: string) {
    if (!contentInstance[method]) {
        throw new Error(`no such method: ${method}`);
    }

    return function (e: Event) {
        if (preventDefault) e.preventDefault();
        contentInstance[method]();
    };
};

interface Divider {
    divider: boolean | (() => boolean);
}

export interface Content {
    id: string;
    content: ActionMenuItem | (() => DomWrapper) | DomWrapper;
    enabledPredicate?: (x: number, y: number) => boolean;
    disabled?: boolean;
    onClick?: (e: MenuItemClickEvent) => void;
    children?: MenuItemSpecList;
}

export type MenuItemSpec = Divider | Content;
export type MenuItemSpecList = MenuItemSpec[];

interface MenuBaseOptions {
    rootClass: string;
    containerClass: string;
    itemClass: string;
    disabledClass: string;
    dividerClass: string;
    activeSubMenuClass: string;
    subMenuShowDelay: number;
    subMenuHideDelay: number;
}

interface MenuContextOptions extends MenuBaseOptions {
    menuItemIconContainerClass: string;
    menuItemIconClass: string;
    menuItemContentClass: string;
    menuItemTextClass: string;
}

export interface ActionMenuCallerOptions {
    _initialLevel?: number;
    menu: MenuItemSpecList;
    manualTrigger?: boolean;
    align: keyof typeof alignMap & string;
}

export interface ButtonMenuCallerOptions extends ActionMenuCallerOptions {
    zIndex: number;
    target: DomWrapperSelector;
}
export interface VirtualButtonMenuCallerOptions {
    menu: MenuItemSpecList;
    zIndex: number;
}

export type ActionMenuCreationOptions = MenuBaseOptions & ActionMenuCallerOptions;
export type ButtonMenuCreationOptions = MenuBaseOptions & ButtonMenuCallerOptions;

export interface MenuDeps {
    page: Page;
    rippler: Rippler;
    recognizerContext: GestureRecognizerContext;
    globalEvents: GlobalEvents;
}

type ActionMenuClass = typeof ActionMenu;
type ContextMenuClass = typeof ContextMenu;
type ButtonMenuClass = typeof ButtonMenu;
type VirtualButtonMenuClass = typeof VirtualButtonMenu;

export default class MenuContext {
    private readonly rootClass: string;
    private readonly containerClass: string;
    private readonly itemClass: string;
    private readonly disabledClass: string;
    private readonly dividerClass: string;
    private readonly activeSubMenuClass: string;
    private readonly subMenuShowDelay: number;
    private readonly subMenuHideDelay: number;
    private readonly menuItemIconContainerClass: string;
    private readonly menuItemIconClass: string;
    private readonly menuItemContentClass: string;
    private readonly menuItemTextClass: string;

    private readonly page: Page;
    private readonly rippler: Rippler;
    private readonly recognizerContext: GestureRecognizerContext;
    private readonly globalEvents: GlobalEvents;

    constructor(opts: MenuContextOptions, deps: MenuDeps) {
        this.rootClass = opts.rootClass;
        this.containerClass = opts.containerClass;
        this.itemClass = opts.itemClass;
        this.disabledClass = opts.disabledClass;
        this.dividerClass = opts.dividerClass;
        this.activeSubMenuClass = opts.activeSubMenuClass;
        this.subMenuShowDelay = opts.subMenuShowDelay;
        this.subMenuHideDelay = opts.subMenuHideDelay;
        this.menuItemIconContainerClass = opts.menuItemIconContainerClass;
        this.menuItemIconClass = opts.menuItemIconClass;
        this.menuItemContentClass = opts.menuItemContentClass;
        this.menuItemTextClass = opts.menuItemTextClass;

        this.page = deps.page;
        this.rippler = deps.rippler;
        this.recognizerContext = deps.recognizerContext;
        this.globalEvents = deps.globalEvents;
    }

    _copyOpts(opts: ActionMenuCallerOptions): ActionMenuCreationOptions;
    _copyOpts(opts: ButtonMenuCallerOptions): ButtonMenuCreationOptions;
    _copyOpts(opts: any): any {
        return {
            ...opts,
            rootClass: this.rootClass,
            containerClass: this.containerClass,
            itemClass: this.itemClass,
            disabledClass: this.disabledClass,
            dividerClass: this.dividerClass,
            activeSubMenuClass: this.activeSubMenuClass,
            subMenuShowDelay: this.subMenuShowDelay,
            subMenuHideDelay: this.subMenuHideDelay,
        };
    }

    _construct(opts: ActionMenuCallerOptions, Constructor: ActionMenuClass): ActionMenu;
    _construct(opts: ButtonMenuCallerOptions, Constructor: ContextMenuClass): ContextMenu;
    _construct(opts: VirtualButtonMenuCallerOptions, Constructor: VirtualButtonMenuClass): VirtualButtonMenu;
    _construct(opts: ButtonMenuCallerOptions, Constructor: ButtonMenuClass): ButtonMenu;
    _construct(opts: any, Constructor: any): any {
        return new Constructor(this._copyOpts(opts), {
            page: this.page,
            recognizerContext: this.recognizerContext,
            rippler: this.rippler,
            globalEvents: this.globalEvents,
        }) as any;
    }

    createActionMenu(opts: ActionMenuCallerOptions) {
        return this._construct(opts, ActionMenu);
    }

    createContextMenu(opts: ButtonMenuCallerOptions) {
        return this._construct(opts, ContextMenu);
    }

    createButtonMenu(opts: ButtonMenuCallerOptions) {
        return this._construct(opts, ButtonMenu);
    }

    createVirtualButtonMenu(opts: VirtualButtonMenuCallerOptions) {
        return this._construct(opts, VirtualButtonMenu);
    }

    createMenuItem(text: string, icon?: string) {
        const content = this.page.createElement(`div`, {
            class: `${this.menuItemContentClass} ${slugTitle(text)}`,
        });

        const iconContainer = this.page.createElement(`div`, {
            class: this.menuItemIconContainerClass,
        });
        if (icon) {
            iconContainer.append(
                this.page.createElement(`span`, {
                    class: `${this.menuItemIconClass} ${icon}`,
                })
            );
        }

        const textContainer = this.page
            .createElement(`div`, {
                class: this.menuItemTextClass,
            })
            .setText(text);

        content.append(iconContainer).append(textContainer);

        return content;
    }
}
