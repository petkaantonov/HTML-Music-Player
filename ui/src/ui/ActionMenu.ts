import { EventEmitterInterface, Rect } from "shared/types/helpers";
import { _, toFunction } from "shared/util";
import Page, { DomWrapper, isTouchEvent, preventDefaultHandler } from "ui/platform/dom/Page";
import GlobalEvents from "ui/platform/GlobalEvents";
import EventEmitter from "vendor/events";

import GestureObject from "./gestures/GestureObject";
import GestureRecognizerContext from "./gestures/GestureRecognizerContext";
import TapRecognizer from "./gestures/TapRecognizer";
import TouchdownRecognizer from "./gestures/TouchdownRecognizer";
import { ActionMenuCreationOptions, ButtonMenuCreationOptions, Content, MenuDeps, MenuItemSpec } from "./MenuContext";
import Rippler, { Ripple } from "./Rippler";

const TRANSITION_IN_DURATION = 300;
const TRANSITION_OUT_DURATION = 200;

export const ALIGN_LEFT_SIDE_AT_TOP = `left-side-at-top`;
export const ALIGN_LEFT_SIDE_AT_BOTTOM = `left-side-at-bottom`;
export const ALIGN_LEFT_SIDE_ABOVE_TOP = `left-side-above-top`;
export const ALIGN_RIGHT_SIDE_AT_TOP = `right-side-at-top`;
export const ALIGN_RIGHT_SIDE_AT_BOTTOM = `right-side-at-bottom`;
export const ALIGN_RIGHT_SIDE_ABOVE_TOP = `right-side-above-top`;
export const ALIGN_LEFT_TOP_CORNER = `left-top-corner`;
export const ALIGN_RIGHT_TOP_CORNER = `right-top-corner`;
export const ALIGN_LEFT_BOTTOM_CORNER = `left-bottom-corner`;
export const ALIGN_RIGHT_BOTTOM_CORNER = `right-bottom-corner`;

type Direction = `end` | `start`;

export const alignMap = {
    [ALIGN_LEFT_SIDE_AT_TOP](buttonBox: Rect, menuBox: Rect) {
        return {
            x: buttonBox.left - menuBox.width,
            y: buttonBox.top,
        };
    },
    [ALIGN_LEFT_SIDE_AT_BOTTOM](buttonBox: Rect, menuBox: Rect) {
        return {
            x: buttonBox.left - menuBox.width,
            y: buttonBox.bottom,
        };
    },
    [ALIGN_LEFT_SIDE_ABOVE_TOP](buttonBox: Rect, menuBox: Rect) {
        return {
            x: buttonBox.left - menuBox.width,
            y: buttonBox.top - menuBox.height,
        };
    },
    [ALIGN_RIGHT_SIDE_AT_TOP](buttonBox: Rect) {
        return {
            x: buttonBox.right,
            y: buttonBox.top,
        };
    },
    [ALIGN_RIGHT_SIDE_AT_BOTTOM](buttonBox: Rect) {
        return {
            x: buttonBox.right,
            y: buttonBox.bottom,
        };
    },
    [ALIGN_RIGHT_SIDE_ABOVE_TOP](buttonBox: Rect, menuBox: Rect) {
        return {
            x: buttonBox.right,
            y: buttonBox.top - menuBox.height,
        };
    },
    [ALIGN_LEFT_TOP_CORNER](buttonBox: Rect) {
        return {
            x: buttonBox.left,
            y: buttonBox.top,
        };
    },
    [ALIGN_RIGHT_TOP_CORNER](buttonBox: Rect, menuBox: Rect) {
        return {
            x: buttonBox.right - menuBox.width,
            y: buttonBox.top,
        };
    },
    [ALIGN_LEFT_BOTTOM_CORNER](buttonBox: Rect, menuBox: Rect) {
        return {
            x: buttonBox.left,
            y: buttonBox.bottom - menuBox.height,
        };
    },
    [ALIGN_RIGHT_BOTTOM_CORNER](buttonBox: Rect, menuBox: Rect) {
        return {
            x: buttonBox.right - menuBox.width,
            y: buttonBox.bottom - menuBox.height,
        };
    },
};

function positionInDimension(
    preferredDirection: Direction,
    coordStart: number,
    coordEnd: number,
    dimensionValue: number,
    maxValue: number
) {
    const roomOnEnd = maxValue - (coordEnd - 3 + dimensionValue);
    const roomOnStart = coordStart + 3 - dimensionValue;
    let ret = -1;

    // Doesn't fit anywhere.
    if (roomOnStart < 0 && roomOnEnd < 0) {
        if (roomOnStart > roomOnEnd) {
            preferredDirection = `end`;
            ret = Math.min(maxValue, coordStart + 3) - dimensionValue;
            ret = Math.max(0, Math.min(maxValue - dimensionValue, ret));
        } else {
            preferredDirection = `start`;
            ret = Math.max(0, coordEnd - 3);
            ret = Math.max(0, Math.min(maxValue - dimensionValue, ret));
        }
    } else {
        while (ret < 0 || ret + dimensionValue > maxValue) {
            if (preferredDirection === `end`) {
                ret = Math.max(0, coordEnd - 3);

                if (ret + dimensionValue > maxValue) {
                    ret = Math.min(maxValue, coordStart + 3) - dimensionValue;
                    ret = Math.max(0, Math.min(maxValue - dimensionValue, ret));

                    preferredDirection = `start`;
                }
            } else {
                ret = Math.min(maxValue, coordStart + 3) - dimensionValue;
                ret = Math.min(maxValue - dimensionValue, ret);

                if (ret < 0) {
                    ret = Math.max(0, coordEnd - 3);
                    ret = Math.max(0, Math.min(maxValue - dimensionValue, ret));
                    preferredDirection = `end`;
                }
            }
        }
    }

    return {
        coordStart: ret,
        preferredDirection,
    };
}

export class MenuItemClickEvent extends Event {
    defaultPrevented: boolean;
    ripplePrevented: boolean;
    constructor() {
        super(`MenuItemClickEvent`);
        this.defaultPrevented = false;
        this.ripplePrevented = false;
    }

    preventDefault() {
        this.defaultPrevented = true;
    }

    preventRipple() {
        this.ripplePrevented = true;
    }
}

export class ActionMenuItem {
    readonly root: ActionMenu;
    parent?: ActionMenuItem | null;
    readonly children?: ActionMenuItem[];
    readonly id?: string;
    readonly divider: boolean | (() => boolean);
    disabled?: boolean;
    private handler?: (e: MenuItemClickEvent) => void;
    private enabledPredicate?: (x: number, y: number) => boolean;
    private _preferredHorizontalDirection: Direction;
    private _preferredVerticalDirection: Direction;
    private _delayTimerId: number;
    private _content: any;
    private _containerDom: any;
    private _domNode: any;
    private containerTouchedRecognizer: any;
    private tapRecognizer: any;
    private itemTouchedRecognizer: any;
    constructor(root: ActionMenu, spec: MenuItemSpec, children: ActionMenuItem[] | undefined, level: number) {
        this.root = root;
        this.parent = null;
        this.children = children;
        if (isContent(spec)) {
            this.id = spec.id;
            this.divider = false;
            this.disabled = !!spec.disabled;
            this.handler = toFunction(spec.onClick);
            this.enabledPredicate = spec.enabledPredicate;
            this._content = toFunction(spec.content);
        } else {
            this.divider = spec.divider;
        }

        this._preferredHorizontalDirection = `end`;
        this._preferredVerticalDirection = `end`;
        this._delayTimerId = -1;
        this._containerDom = this.page().NULL();
        this._domNode = this._createDom();

        if (this.disabled) {
            this.$().addClass(this.root.disabledClass);
        }
        this.containerTouchedRecognizer = this.root.recognizerContext.createTouchdownRecognizer(
            this.containerMouseEntered
        );
        this.tapRecognizer = this.root.recognizerContext.createTapRecognizer(this.itemClicked);
        this.itemTouchedRecognizer = this.root.recognizerContext.createTouchdownRecognizer(this.itemTouchStarted);

        if (this.children) {
            this._containerDom = this._createContainerDom(level);
            this.children.forEach(child => child.setParent(this));

            this.$().addEventListener(`mouseenter`, this.itemMouseEntered);
            this.$().addEventListener(`mouseleave`, this.itemMouseLeft);
            this.$container().addEventListener(`mouseenter`, this.containerMouseEntered);
            this.$container().addEventListener(`mouseleave`, this.containerMouseLeft);

            this.containerTouchedRecognizer.recognizeBubbledOn(this.$container());
        }

        if (!this.divider) {
            this.$().addEventListener(`click`, this.itemClicked);
            this.tapRecognizer.recognizeBubbledOn(this.$());
            this.itemTouchedRecognizer.recognizeBubbledOn(this.$());
        }
    }

    page() {
        return this.root.page;
    }

    destroy() {
        this._clearDelayTimer();
        this.$().remove();
        this.$container().remove();
    }

    _clearDelayTimer() {
        this.page().clearTimeout(this._delayTimerId);
        this._delayTimerId = -1;
    }

    startHideTimer() {
        this._clearDelayTimer();
        this._delayTimerId = this.page().setTimeout(() => {
            this._delayTimerId = -1;
            this.hideContainer();
        }, this.root.hideDelay);
    }

    hideChildren(targetMenuItem: HTMLElement | null = null) {
        if (!this.children) {
            return;
        }
        for (let i = 0; i < this.children.length; ++i) {
            const child = this.children[i]!;
            if (child.children) {
                if (targetMenuItem && this.page().$(targetMenuItem).closest(child.$()).length) {
                    continue;
                }
                child.startHideTimer();
                child.hideChildren();
            }
        }
    }

    menuItemTouchStarted = (child: ActionMenuItem) => {
        if (!this.children) {
            return;
        }
        for (let i = 0; i < this.children.length; ++i) {
            const otherChild = this.children[i]!;
            if (child !== otherChild) {
                otherChild.removeActiveClass();
                otherChild.hideContainer();
            }
        }
    };

    itemTouchStarted = (e: MouseEvent | GestureObject) => {
        if (this.children && this.children.length) {
            void this.root.rippleEventTarget(e, this.zIndex() + 1);
        }
        const parent = this.parent ? this.parent : this.root;
        parent.menuItemTouchStarted(this);
        if (this.children) {
            this.initSubMenuShowing(0);
        }
    };

    initSubMenuShowing(delay: number) {
        this.addActiveClass();
        this.root.clearDelayTimer();
        this._clearDelayTimer();
        if (this.disabled) return;
        if (this.isShown()) {
            this.hideChildren();
            return;
        }

        this._delayTimerId = this.page().setTimeout(() => {
            this._delayTimerId = -1;
            this.showContainer();
        }, delay);
    }

    itemMouseEntered = () => {
        this.initSubMenuShowing(this.root.showDelay);
    };

    itemMouseLeft = (e: MouseEvent) => {
        this._clearDelayTimer();
        if (this.disabled) return;
        if (
            !this.page()
                .$(e.relatedTarget as HTMLElement)
                .closest(this.$container()).length
        ) {
            this.removeActiveClass();
            this.startHideTimer();
        }
    };

    zIndex() {
        const container = this.parent ? this.parent.$container() : this.root.$();
        return +container.style().zIndex;
    }

    containerMouseLeft = (e: MouseEvent) => {
        if (this.disabled) return;
        this._clearDelayTimer();
        const $related = this.page().$(e.relatedTarget as HTMLElement);
        if ($related.closest(this.$()).length) {
            return;
        }

        const container = this.parent ? this.parent.$container() : this.root.$();

        if ($related.closest(container).length) {
            this.startHideTimer();
            return;
        }
        this.root.startHideTimer();
    };

    containerMouseEntered = (e: MouseEvent | GestureObject) => {
        if (this.disabled) return;
        this.root.clearDelayTimer();
        this._clearDelayTimer();
        this.addActiveClass();
        if (this.isShown()) {
            this.hideChildren(e.target as HTMLElement);
        }
    };

    itemClicked = (e: MouseEvent | GestureObject) => {
        if (this.disabled) {
            void this.root.rippleEventTarget(e, this.zIndex() + 1);
            return;
        }
        if (this.children) {
            this._clearDelayTimer();
            if (!this.isShown()) {
                this.showContainer();
            }
        } else {
            const menuItemClickEvent = new MenuItemClickEvent();
            try {
                this.handler!(menuItemClickEvent);
            } finally {
                if (!menuItemClickEvent.defaultPrevented) {
                    this.root.hideContainer();
                    this.root.emit(`itemClicked`, this.id!);
                } else if (!menuItemClickEvent.ripplePrevented) {
                    void this.root.rippleEventTarget(e, this.zIndex() + 1);
                }
            }
        }
    };

    $() {
        return this._domNode;
    }

    $container() {
        return this._containerDom;
    }

    _createContainerDom(level: number) {
        const levelClass = level <= 5 ? `action-menu-level-${level}` : `action-menu-level-too-deep`;

        return this.page()
            .createElement(`div`, {
                class: `${this.root.containerClass} ${levelClass}`,
            })
            .setStyles({
                position: `absolute`,
                zIndex: `${Math.max(50, level * 100000)}`,
            });
    }

    _createDom() {
        if (this.divider) {
            const node = this.page().createElement(`div`, { class: this.root.dividerClass });
            if (typeof this.divider === `function` && !this.divider()) {
                node.hide();
            }
            return node;
        } else {
            const content = this._content(this);
            const node = this.page().createElement(`div`, { class: this.root.itemClass });
            if (typeof content === `string`) {
                node.setHtml(content);
            } else if (content === null || typeof content === `undefined`) {
                node.hide();
            } else {
                node.empty().append(content);
            }
            return node;
        }
    }

    refresh() {
        if (!this.isShown()) return;

        if (this.divider) {
            if (typeof this.divider === `function`) {
                if (this.divider()) {
                    this.$().show();
                } else {
                    this.$().hide();
                }
            }
            return;
        }

        const content = this._content(this);

        if (typeof content === `string`) {
            this.$().setHtml(content).show();
        } else if (content === null || typeof content === `undefined`) {
            this.$().empty().hide();
        } else {
            this.$().show().empty().append(content);
        }
        if (this.parent) this.parent.positionSubMenu();
    }

    setParent(parent: ActionMenuItem) {
        this.parent = parent;
        this.$().appendTo(this.parent.$container());
        this.parent.$().addClass(`action-menu-sub-menu-item`);
    }

    setEnabledStateFromPredicate(x: number, y: number) {
        if (typeof this.enabledPredicate === `function`) {
            const enabled = this.enabledPredicate(x, y);
            if (enabled) {
                this.enable();
            } else {
                this.disable();
            }
        }
    }

    enable() {
        if (!this.disabled) return;
        this.disabled = false;
        this.$().removeClass(this.root.disabledClass);
    }

    disable() {
        if (this.disabled) return;
        this.disabled = true;
        this.$().addClass(this.root.disabledClass);
        this.hideContainer();
    }

    isShown() {
        if (this.$container() !== this.page().NULL()) {
            return this.$container().parent().length > 0;
        }
        return this.$().parent().length > 0;
    }

    getHorizontalDirection() {
        return this.parent ? this.parent._preferredHorizontalDirection : this._preferredHorizontalDirection;
    }

    getVerticalDirection() {
        return this.parent ? this.parent._preferredVerticalDirection : this._preferredVerticalDirection;
    }

    positionSubMenu = () => {
        const origin = { x: 0, y: 0 };
        if (!this.isShown()) return origin;
        const itemBox = this.$()[0].getBoundingClientRect();
        const containerBox = this.$container()[0].getBoundingClientRect();
        const xMax = this.page().width();
        const yMax = this.page().height();

        let left = -1;
        let top = -1;

        let preferredDirection = this.getHorizontalDirection();
        let positionResult = positionInDimension(
            preferredDirection,
            itemBox.left,
            itemBox.right,
            containerBox.width,
            xMax
        );
        left = positionResult.coordStart;
        this._preferredHorizontalDirection = positionResult.preferredDirection;

        preferredDirection = this.getVerticalDirection();
        positionResult = positionInDimension(
            preferredDirection,
            itemBox.top + 3,
            itemBox.top + 3,
            containerBox.height,
            yMax
        );
        top = positionResult.coordStart;
        this._preferredVerticalDirection = positionResult.preferredDirection;

        this.$container().setStyles({
            top: `${top}px`,
            left: `${left}px`,
        });

        origin.x = left > itemBox.left + 3 ? 0 : containerBox.width;
        origin.y = top > itemBox.top + 3 ? 0 : Math.max(itemBox.top - top, 0);

        return origin;
    };

    addActiveClass() {
        if (this.disabled) return;
        this.$().addClass(this.root.activeSubMenuClass);
    }

    removeActiveClass() {
        this.$().removeClass(this.root.activeSubMenuClass);
    }

    showContainer() {
        this.addActiveClass();
        this.$container()
            .setStyle(`willChange`, `transform`)
            .removeClass([`transition-out`, `transition-in`, `initial`])
            .appendTo(`body`);
        const origin = this.positionSubMenu();
        this.$container()
            .setTransformOrigin(`${origin.x}px ${origin.y}px 0px`)
            .detach()
            .removeClass(`transition-out`)
            .addClass([`initial`, `transition-in`])
            .appendTo(`body`)
            .forceReflow();

        this.page().changeDom(() => {
            this.$container().removeClass(`initial`);
            this.page().setTimeout(() => {
                this.$container().setStyle(`willChange`, ``);
            }, TRANSITION_IN_DURATION);
        });
    }

    hideContainer() {
        this._preferredVerticalDirection = `end`;
        this._preferredHorizontalDirection = `end`;
        this._clearDelayTimer();
        this.$container()
            .setStyle(`willChange`, `transform`)
            .removeClass(`transition-in`)
            .addClass([`initial`, `transition-out`])
            .forceReflow();

        this.page().changeDom(() => {
            this.$container().removeClass(`initial`);
            this._delayTimerId = this.page().setTimeout(() => {
                this._delayTimerId = -1;
                this.$container().detach().setStyle(`willChange`, ``);
            }, TRANSITION_OUT_DURATION);
        });
        this.removeActiveClass();
        if (this.children) {
            this.children.forEach(child => {
                child.hideContainer();
            });
        }
    }
}

function isContent(spec: MenuItemSpec): spec is Content {
    return `content` in spec;
}

function createMenuItem<T extends ActionMenu>(root: T, spec: MenuItemSpec, level: number): ActionMenuItem {
    let children;
    if (isContent(spec) && spec.children) {
        children = spec.children.map(childSpec => createMenuItem(root, childSpec, level + 1));
    }
    return new ActionMenuItem(root, spec, children, level);
}

interface ActionMenuEventsMap {
    activationChanged: (a: ActionMenu) => void;
    itemClicked: (id: string) => void;
}

export default interface ActionMenu extends EventEmitterInterface<ActionMenuEventsMap> {}

export default class ActionMenu extends EventEmitter {
    readonly page: Page;
    readonly globalEvents: GlobalEvents;
    readonly rippler: Rippler;
    readonly recognizerContext: GestureRecognizerContext;
    readonly rootClass: string;
    readonly containerClass: string;
    readonly itemClass: string;
    readonly disabledClass: string;
    readonly dividerClass: string;
    readonly activeSubMenuClass: string;
    readonly showDelay: number;
    readonly hideDelay: number;

    private _delayTimerId: number;
    private readonly _domNode: DomWrapper;
    private readonly _menuItems: ActionMenuItem[];
    private _currentRipple: null | Ripple;
    private readonly _idToItem: Record<string, ActionMenuItem>;

    constructor(opts: ActionMenuCreationOptions, deps: MenuDeps) {
        super();
        opts = Object(opts);
        this.page = deps.page;
        this.globalEvents = deps.globalEvents;
        this.rippler = deps.rippler;
        this.recognizerContext = deps.recognizerContext;

        this.rootClass = opts.rootClass;
        this.containerClass = opts.containerClass;
        this.itemClass = opts.itemClass;
        this.disabledClass = opts.disabledClass;
        this.dividerClass = opts.dividerClass;
        this.activeSubMenuClass = opts.activeSubMenuClass;
        this.showDelay = Math.min(1000, Math.max(0, opts.subMenuShowDelay));
        this.hideDelay = Math.min(3000, Math.max(0, opts.subMenuHideDelay));

        this._delayTimerId = -1;
        this._domNode = this.page.createElement(`div`, {
            class: this.rootClass,
        });

        this._menuItems = opts.menu.map(spec => createMenuItem(this, spec, opts._initialLevel || 1));
        this._menuItems.forEach(item => item.$().appendTo(this.$()));

        this._currentRipple = null;
        this._idToItem = {};
        this.forEach(item => {
            if (item.divider) return;
            if (!item.id) {
                throw new Error(`unique id is required for menu item`);
            }
            const id = `${item.id}`;

            if (this._idToItem[id]) {
                throw new Error(`unique id is required for menu item. ${id} is duplicate.`);
            }

            this._idToItem[id] = item;
        }, this);
    }

    async rippleEventTarget(e: MouseEvent | GestureObject, zIndex: number) {
        const ripple = this.rippler.rippleElement(
            e.currentTarget as HTMLElement,
            e.clientX,
            e.clientY,
            undefined,
            zIndex
        );
        this._currentRipple = ripple;
        await ripple.finished();
        if (this._currentRipple === ripple) {
            this._currentRipple = null;
        }
    }

    cancelRipple() {
        if (this._currentRipple) {
            this._currentRipple.cancel();
            this._currentRipple = null;
        }
    }

    setEnabledStateFromPredicate(x: number, y: number) {
        this.forEach(item => {
            if (item.divider) return;
            item.setEnabledStateFromPredicate(x, y);
        });
    }

    destroy() {
        this.cancelRipple();
        this.clearDelayTimer();
        this.forEach((_ as any).destroy);
        this.hideContainer();
        this.$().remove();
        this.removeAllListeners();
    }

    menuItemTouchStarted(child: ActionMenuItem) {
        for (let i = 0; i < this._menuItems.length; ++i) {
            const otherChild = this._menuItems[i]!;
            if (child !== otherChild) {
                otherChild.removeActiveClass();
                otherChild.hideContainer();
            }
        }
    }

    $containers() {
        let ret = this.$();
        this.forEach(item => {
            if (item.children && item.isShown()) {
                ret = ret.add(item.$container()[0]);
            }
        });
        return ret;
    }

    $() {
        return this._domNode;
    }

    clearDelayTimer() {
        this.page.clearTimeout(this._delayTimerId);
        this._delayTimerId = -1;
    }

    startHideTimer() {
        this.clearDelayTimer();
        this._delayTimerId = this.page.setTimeout(() => {
            this._delayTimerId = -1;
            this.hideContainer();
        }, this.hideDelay);
    }

    hideContainer() {
        this.cancelRipple();
        this._menuItems.forEach(item => {
            item.hideContainer();
        });
    }

    forEach(fn: (i: ActionMenuItem, index: number) => false | undefined | void, ctx?: object) {
        const items = this._menuItems.slice();
        let index = 0;

        while (items.length > 0) {
            const item = items.shift()!;

            if (item.children) {
                items.push(...item.children);
            }

            if (fn.call(ctx || item, item, index) === false) return;
            index++;
        }
    }

    refreshAll() {
        this.forEach(ActionMenuItem.prototype.refresh);
    }

    disableAll() {
        this.forEach(ActionMenuItem.prototype.disable);
        this.emit(`activationChanged`, this);
    }

    enableAll() {
        this.forEach(ActionMenuItem.prototype.enable);
        this.emit(`activationChanged`, this);
    }

    disable(actions: string | string[]) {
        if (!Array.isArray(actions)) {
            actions = [actions];
        }
        actions.forEach(action => this._idToItem[action]!.disable());
        this.emit(`activationChanged`, this);
    }

    enable(actions: string | string[]) {
        if (!Array.isArray(actions)) {
            actions = [actions];
        }
        actions.forEach(action => this._idToItem[action]!.enable());
        this.emit(`activationChanged`, this);
    }
}

interface WrapPreventDefault {
    originalEvent: MouseEvent;
    preventDefault: () => void;
}

interface ButtonMenuEventsMap {
    willHideMenu: (a: ButtonMenu) => void;
    didHideMenu: (a: ButtonMenu) => void;
    willShowMenu: (e: MouseEvent | GestureObject, a: ButtonMenu) => void;
    didShowMenu: (e: MouseEvent | GestureObject, a: ButtonMenu) => void;
    beforeOpen: (e: WrapPreventDefault) => void;
}

export interface ButtonMenu extends EventEmitterInterface<ButtonMenuEventsMap> {}

export class ButtonMenu extends EventEmitter {
    protected _menu: ActionMenu;
    private _zIndex: number;
    private _domNode: DomWrapper;
    protected _shown: boolean;
    private _targetDom: DomWrapper;
    private _x: number;
    private _y: number;
    private _xMax: number;
    private _yMax: number;
    private _delayTimerId: number;
    private _aligner: ((a: Rect, b: Rect) => { x: number; y: number }) | null;
    protected documentTouchedRecognizer: TouchdownRecognizer;
    private _tapRecognizer: TapRecognizer | null;
    private _manualTrigger: boolean;
    protected preventDefault: (e: Event) => void;

    constructor(opts: ButtonMenuCreationOptions, deps: MenuDeps) {
        super();
        opts._initialLevel = 2;
        opts.rootClass = `${opts.rootClass} action-menu-context-root`;
        this._menu = new ActionMenu(opts, deps);
        this._zIndex = opts.zIndex;
        this._domNode = this._menu.$().setStyles({
            position: `absolute`,
            zIndex: `${opts.zIndex}`,
        });
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this.preventDefault = () => {};
        this._shown = false;
        this._targetDom = this.page().$(opts.target);
        this._x = 0;
        this._y = 0;
        this._xMax = 0;
        this._yMax = 0;
        this._delayTimerId = -1;
        this._aligner = null;

        this.documentTouchedRecognizer = this._menu.recognizerContext.createTouchdownRecognizer(this.documentClicked);
        this.documentTouchedRecognizer.recognizeCapturedOn(this.page().document());
        this.page().addDocumentListener(`mousedown`, this.documentClicked, { capture: true });
        this._menu.on(`itemClicked`, this._itemClicked);
        this._menu.globalEvents.on(`resize`, this.position);
        this._menu.globalEvents.on(`visibilityChange`, this.hide);

        this._tapRecognizer = null;
        this._manualTrigger = !!opts.manualTrigger;
        if (!this._manualTrigger) {
            this._tapRecognizer = this._menu.recognizerContext.createTapRecognizer(this.buttonClicked);
            this._tapRecognizer.recognizeBubbledOn(this.$target());
            this.$target().addEventListener(`click`, this.buttonClicked, false);
        }
        if (opts.align) {
            this._aligner = alignMap[opts.align];
            if (typeof this._aligner !== `function`) {
                throw new Error(`${opts.align} is not valid alignment`);
            }
        } else {
            this._aligner = null;
        }
    }

    _itemClicked = () => {
        this.hide();
    };

    page() {
        return this._menu.page;
    }

    $target() {
        return this._targetDom;
    }

    $() {
        return this._domNode;
    }

    destroy() {
        this.hide();
        if (!this._manualTrigger) {
            if (this._tapRecognizer) {
                this._tapRecognizer.unrecognizeBubbledOn(this.$target());
            }
            this.$target().removeEventListener(`click`, this.buttonClicked, false);
        }
        this._menu.destroy();
    }

    position = () => {
        const origin = { x: 0, y: 0 };
        if (!this._shown) return origin;
        let x = this._x;
        let y = this._y;
        const box = this.$()[0]!.getBoundingClientRect();
        const xMax = this.page().width();
        const yMax = this.page().height();

        let positionChanged = false;
        if (xMax !== this._xMax || yMax !== this._yMax) {
            x *= xMax / this._xMax;
            y *= yMax / this._yMax;
            this._x = x;
            this._y = y;
            this._xMax = xMax;
            this._yMax = yMax;
            positionChanged = true;
        }

        if (x + box.width > xMax) {
            positionChanged = true;
            x = Math.max(0, xMax - box.width);
            origin.x = Math.max(0, this._x - x);
        }

        if (y + box.height > yMax) {
            positionChanged = true;
            y = Math.max(0, yMax - box.height);
            origin.y = Math.max(0, this._y - y);
        }

        this.$().setStyles({ left: `${x}px`, top: `${y}px` });

        if (positionChanged) {
            this._menu.forEach(child => {
                if (child.children) {
                    child.positionSubMenu();
                }
            });
        }
        return origin;
    };

    hide = (noAnimation = false) => {
        if (!this._shown) return;
        this.emit(`willHideMenu`, this);
        this._shown = false;

        if (!noAnimation) {
            this.$().removeClass(`transition-in`).addClass([`initial`, `transition-out`]).forceReflow();
            this.page().changeDom(() => {
                this.$().removeClass(`initial`);
                this._delayTimerId = this.page().setTimeout(() => {
                    this._delayTimerId = -1;
                    this.$().detach();
                }, TRANSITION_OUT_DURATION);
            });
        } else {
            this.$().detach();
        }

        this._menu.hideContainer();
        this.emit(`didHideMenu`, this);
    };

    documentClicked = (e: MouseEvent | GestureObject) => {
        if (!this._shown) return;

        const $target = this.page().$(e.target as HTMLElement);
        let containerClicked = false;
        this._menu.$containers().forEach(elem => {
            if ($target.closest(elem).length > 0) {
                containerClicked = true;
                return false;
            }
            return true;
        });

        if (!containerClicked) {
            this.hide();
        }
    };

    buttonClicked = (e: MouseEvent | GestureObject) => {
        void this._menu.rippleEventTarget(e, this._zIndex);
        if (this._shown) {
            this.hide();
        } else {
            this.show(e);
        }
    };

    show = (e: MouseEvent | GestureObject) => {
        if (this._shown) return;
        this.page().clearTimeout(this._delayTimerId);
        this._delayTimerId = -1;

        let prevented = false;
        this.preventDefault = function () {
            prevented = true;
        };
        this.emit(`willShowMenu`, e, this);
        if (prevented) return;
        this._shown = true;
        this.$().removeClass([`transition-out`, `transition-in`, `initial`]).appendTo(`body`);
        const coords = this.getCoords();
        this._x = coords.x;
        this._y = coords.y;
        this._xMax = this.page().width();
        this._yMax = this.page().height();
        const origin = this.position();
        this.$().setTransformOrigin(`${origin.x}px ${origin.y}px 0px`);

        // Transition from desktop right click feels weird so only do it on touch.
        if (isTouchEvent(e)) {
            this.$().detach().addClass([`initial`, `transition-in`]).appendTo(`body`).forceReflow();
            this.page().changeDom(() => {
                this.$().removeClass(`initial`);
            });
        }

        this.emit(`didShowMenu`, e, this);
    };

    getCoords(_e?: GestureObject | MouseEvent) {
        const buttonBox = this.$target()[0]!.getBoundingClientRect();
        const menuBox = this.$()[0]!.getBoundingClientRect();
        if (this._aligner) {
            return this._aligner(buttonBox, menuBox);
        }
        return {
            x: buttonBox.right - 5,
            y: buttonBox.top + 2,
        };
    }
}

export interface ButtonMenu {
    disable: ActionMenu[`disable`];
    enable: ActionMenu[`enable`];
    disableAll: ActionMenu[`disableAll`];
    enableAll: ActionMenu[`enableAll`];
    refreshAll: ActionMenu[`refreshAll`];
    setEnabledStateFromPredicate: ActionMenu[`setEnabledStateFromPredicate`];
    forEach: ActionMenu[`forEach`];
}

[`disable`, `enable`, `disableAll`, `enableAll`, `refreshAll`, `setEnabledStateFromPredicate`, `forEach`].forEach(
    methodName => {
        const menuMethod = (ActionMenu.prototype as any)[methodName];
        (ButtonMenu.prototype as any)[methodName] = function (...args: any[]) {
            return menuMethod.call(this._menu, ...args);
        };
    }
);

type CoordsProvider = (x: DOMRect) => { x: number; y: number };
export class VirtualButtonMenu extends ButtonMenu {
    private _coordsProvider: CoordsProvider | null;
    constructor(opts: ButtonMenuCreationOptions, deps: MenuDeps) {
        super({ ...opts, manualTrigger: true }, deps);
        this._coordsProvider = null;
    }

    setCoordsProvider(coordsProvider: CoordsProvider) {
        this._coordsProvider = coordsProvider;
    }

    getCoords() {
        const menuBox = this.$()[0]!.getBoundingClientRect();
        return this._coordsProvider!(menuBox);
    }
}

export class ContextMenu extends ButtonMenu {
    constructor(opts: ButtonMenuCreationOptions, deps: MenuDeps) {
        super({ ...opts, manualTrigger: true }, deps);
        this.preventDefault = preventDefaultHandler;

        this.$target().addEventListener(`contextmenu`, this.rightClicked);
        this.page().addDocumentListener(`keydown`, this.keypressed, { capture: true });
    }

    destroy() {
        super.destroy();
        this._menu.removeListener(`itemClicked`, this._itemClicked);
        this._menu.globalEvents.removeListener(`resize`, this.position);
        this._menu.globalEvents.removeListener(`visibilityChange`, this.hide);
        this.page().removeDocumentListener(`mousedown`, this.documentClicked, { capture: true });
        this.page().removeDocumentListener(`keydown`, this.keypressed, { capture: true });
        this.$target().removeEventListener(`contextmenu`, this.rightClicked);
        this.documentTouchedRecognizer.unrecognizeCapturedOn(this.page().document());
        this.removeAllListeners();
    }

    rightClicked = (e: MouseEvent) => {
        this.hide();
        let defaultPrevented = false;
        const ev: WrapPreventDefault = {
            preventDefault() {
                defaultPrevented = true;
            },
            originalEvent: e,
        };
        this.emit(`beforeOpen`, ev);
        if (defaultPrevented) return;
        this.show(e);
        if (this._shown && !isTouchEvent(e)) {
            e.preventDefault();
        }
    };

    getCoords(e: MouseEvent | GestureObject) {
        const ret = super.getCoords();
        ret.x = e.clientX;
        ret.y = e.clientY;
        return ret;
    }

    keypressed = () => {
        if (!this._shown) return;
        this.hide();
    };
}
