import {noUndefinedGet, _equals, _, _call, animationPromisify} from "util";
import EventEmitter from "events";
import {SWIFT_OUT} from "ui/animation/easing";

const EMPTY_TRANSLATE = `translate3d(0, 0, 0)`;
const ANIMATION_DURATION = 220;

class Tab extends EventEmitter {
    constructor(spec, controller, index) {
        super();
        this._controller = controller;
        this._id = spec.id;
        this._domNode = this.page().$(spec.tab).eq(0);
        this._contentNode = this.page().$(spec.content).eq(0);
        this._index = index;
        this._active = false;
        this._clicked = this._clicked.bind(this);
        this._contentRect = this.$content()[0].getBoundingClientRect();
        this._animation = null;
        this.$().addEventListener(`click`, this._clicked);
        controller.recognizerContext.createTapRecognizer(this._clicked).recognizeBubbledOn(this.$());
        const position = this._contentRect.width * this._index;
        this.$content().setTransform(`translate3d(${position}px, 0px, 0px)`);
    }

    $() {
        return this._domNode;
    }

    $content() {
        return this._contentNode;
    }

    setPositionByProgress(activeTabIndex, progress, contentWidth) {
        const newPosition = ((this.index() - activeTabIndex) + progress) * contentWidth;
        this.$content().setTransform(`translate3d(${newPosition}px, 0, 0)`);
    }

    async animateToPosition(activeTabIndex, contentWidth) {
        if (this._animation) {
            await this._animation;
        }
        const newPosition = (this.index() - activeTabIndex) * contentWidth;
        const keyFrames = [
            {transform: this.$content().getTransformForKeyFrame(EMPTY_TRANSLATE)},
            {transform: `translate3d(${newPosition}px, 0, 0)`}
        ];
        const animation = this.$content().animate(keyFrames, this._controller._getAnimationOptions());
        this._animation = animationPromisify(animation);
        await this._animation;
        this._animation = null;
        this.$content().setTransform(`translate3d(${newPosition}px, 0, 0)`);
    }

    _clicked(e) {
        this._controller.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        this.emit(`click`, this);
    }

    async _relayout() {
        this.updateRectCache();
        const activeTabIndex = this._controller.getActiveTab().index();
        const contentWidth = this.contentRect().width;
        const newPosition = (this.index() - activeTabIndex) * contentWidth;
        if (this._animation) {
            await this._animation;
        }
        this.$content().setTransform(`translate3d(${newPosition}px, 0, 0)`);
    }

    updateRectCache() {
        this._contentRect = this.$content()[0].getBoundingClientRect();
    }

    index() {
        return this._index;
    }

    contentRect() {
        return this._contentRect;
    }

    activate() {
        if (this._active) return;
        this._active = true;
        this.$().addClass(`active`);
    }

    isActive() {
        return this._active;
    }

    deactivate() {
        if (!this._active) return;
        this._active = false;
        this.$().removeClass(`active`);
    }

    page() {
        return this._controller.page;
    }
}

export default class TabController extends EventEmitter {
    constructor(domNode, specs, opts, deps) {
        super();
        opts = noUndefinedGet(opts);
        this.page = deps.page;
        this.globalEvents = deps.globalEvents;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;
        this._domNode = this.page.$(domNode).eq(0);
        this._tabClicked = this._tabClicked.bind(this);

        this._activeTab = null;
        this._tabs = specs.map(function(v, index) {
            const tab = new Tab(v, this, index);
            tab.on(`click`, this._tabClicked);
            return tab;
        }, this);
        this._indicatorNode = this.page.$(opts.indicator).eq(0);

        this._relayout = this._relayout.bind(this);
        this.globalEvents.on(`resize`, this._relayout);

        this._activeTabRect = null;
        this._pendingAnimations = null;
        this._animationOptions = {
            easing: SWIFT_OUT,
            duration: 0,
            fill: `none`
        };
    }


    $() {
        return this._domNode;
    }

    $indicator() {
        return this._indicatorNode;
    }

    $containers() {
        return this.page.$(this._tabs.map(_.$content));
    }

    $tabs() {
        return this.page.$(this._tabs.map(_.$));
    }

    _relayout() {
        this._tabs.forEach(_._relayout);
        this._activeTabRect = this._activeTab.contentRect();
    }

    _tabClicked(tab) {
        if (!tab) {
            throw new Error(`no tab?`);
        }
        this._activateTab(tab);
    }

    getActiveTab() {
        return this._activeTab || this._tabs[0];
    }

    getActiveTabId() {
        return this.getActiveTab()._id;
    }

    _getAnimationOptions() {
        return this._animationOptions;
    }

    async _activateTab(tab, force) {
        if (this._pendingAnimations) {
            await this._pendingAnimations;
        }

        const initialTabLoad = !this._activeTab;
        const willChangeTabs = tab !== this._activeTab;
        if (!willChangeTabs && !force) return;

        this._activeTabRect = tab.contentRect();

        let previousActiveTabId;
        let newActiveTabId;

        if (willChangeTabs) {
            if (this._activeTab) {
                previousActiveTabId = this._activeTab._id;
                this._activeTab.deactivate();
                this.emit(`tabWillDeactivate`, this._activeTab._id);
            }
            this.emit(`tabWillActivate`, tab._id, initialTabLoad);
            this._activeTab = tab;
            newActiveTabId = tab._id;
            tab.activate();
        }

        const activeIndex = this._activeTab.index();
        const contentWidth = this._activeTabRect.width;
        const animationsFinished = this._tabs.map(_call.animateToPosition(activeIndex, contentWidth));

        const indicatorKeyFrames = [
            {transform: this.$indicator().getTransformForKeyFrame(EMPTY_TRANSLATE)},
            {transform: `translate3d(${100 * activeIndex}%, 0, 0)`}
        ];
        const indicatorAnimation = this.$indicator().animate(indicatorKeyFrames, this._getAnimationOptions());
        animationsFinished.push(animationPromisify(indicatorAnimation));
        this._pendingAnimations = Promise.all(animationsFinished);
        await this._pendingAnimations;
        this.$indicator().setTransform(`translate3d(${100 * activeIndex}%, 0, 0)`);
        this._pendingAnimations = null;

        if (previousActiveTabId) {
            this.emit(`tabDidDeactivate`, previousActiveTabId);
        }
        if (newActiveTabId) {
            this.emit(`tabDidActivate`, newActiveTabId, initialTabLoad);
        }

        this._animationOptions.duration = ANIMATION_DURATION;
    }

    activateTabById(id) {
        let tab = this._tabs.find(_equals._id(id));
        if (!tab) {
            tab = this._tabs[0];
        }
        return this._activateTab(tab);
    }
}
