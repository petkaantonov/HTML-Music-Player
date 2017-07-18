import {slugTitle} from "util";
import ActionMenu, {ContextMenu, ButtonMenu, VirtualButtonMenu} from "ui/ActionMenu";
import withDeps from "ApplicationDependencies";

export default class MenuContext {
    constructor(opts, deps) {
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

    _copyOpts(opts) {
        opts.rootClass = this.rootClass;
        opts.containerClass = this.containerClass;
        opts.itemClass = this.itemClass;
        opts.disabledClass = this.disabledClass;
        opts.dividerClass = this.dividerClass;
        opts.activeSubMenuClass = this.activeSubMenuClass;
        opts.subMenuShowDelay = this.subMenuShowDelay;
        opts.subMenuHideDelay = this.subMenuHideDelay;
    }

    _construct(opts, Constructor) {
        this._copyOpts(opts);
        return withDeps({
            page: this.page,
            recognizerContext: this.recognizerContext,
            rippler: this.rippler,
            globalEvents: this.globalEvents
        }, deps => new Constructor(opts, deps));
    }

    createActionMenu(opts) {
        return this._construct(opts, ActionMenu);
    }

    createContextMenu(opts) {
        return this._construct(opts, ContextMenu);
    }

    createButtonMenu(opts) {
        return this._construct(opts, ButtonMenu);
    }

    createVirtualButtonMenu(opts) {
        return this._construct(opts, VirtualButtonMenu);
    }

    createMenuItem(text, icon) {
        const content = this.page.createElement(`div`, {
            class: `${this.menuItemContentClass} ${slugTitle(text)}`
        });

        const iconContainer = this.page.createElement(`div`, {
            class: this.menuItemIconContainerClass
        });
        if (icon) {
            iconContainer.append(this.page.createElement(`span`, {
                class: `${this.menuItemIconClass} ${icon}`
            }));
        }

        const textContainer = this.page.createElement(`div`, {
            class: this.menuItemTextClass
        }).setText(text);

        content.append(iconContainer).append(textContainer);

        return content;
    }
}
