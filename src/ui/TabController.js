import {noUndefinedGet, _equals, _, _call, animationPromisify} from "util";
import EventEmitter from "events";
import {SWIFT_OUT} from "ui/animation/easing";

const animationOptions = {
    easing: SWIFT_OUT,
    duration: 220,
    fill: `none`
};

const EMPTY_TRANSLATE = `translate3d(0, 0, 0)`;

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
        const newPosition = (this.index() - activeTabIndex) * contentWidth;
        const keyFrames = [
            {transform: this.$content().getTransformForKeyFrame(EMPTY_TRANSLATE)},
            {transform: `translate3d(${newPosition}px, 0, 0)`}
        ];
        const animation = this.$content().animate(keyFrames, animationOptions);
        await animationPromisify(animation);
        this.$content().setTransform(`translate3d(${newPosition}px, 0, 0)`);
    }

    _clicked(e) {
        this._controller.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        this.emit(`click`, this);
    }

    _relayout() {
        this.updateRectCache();
        const activeTabIndex = this._controller.getActiveTab().index();
        const contentWidth = this.contentRect().width;
        const newPosition = (this.index() - activeTabIndex) * contentWidth;
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

        this._dragStart = this._dragStart.bind(this);
        this._dragMove = this._dragMove.bind(this);
        this._dragEnd = this._dragEnd.bind(this);
        this._dragStartTime = -1;
        this._dragAnchorStart = -1;
        this._dragAnchorEnd = -1;
        this._activeTabRect = null;
        this._pendingAnimations = null;

        this.recognizerContext.
            createHorizontalDragRecognizer(this._dragStart, this._dragMove, this._dragEnd).
            recognizeBubbledOn(this.$());
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

    _dragStart(gesture) {
        this._dragAnchorStart = gesture.clientX;
        this._dragStartTime = gesture.timeStamp;

        this._tabs.forEach(_.updateRectCache);
        this._activeTabRect = this._activeTab.contentRect();
    }

    _dragMove(gesture) {
        const deltaX = -1 * (this._dragAnchorStart - gesture.clientX);
        const activeIndex = this._activeTab.index();

        if ((activeIndex === 0 && deltaX > 0) ||
            (activeIndex === this._tabs.length - 1 && deltaX < 0) ||
            this._pendingAnimations) {
            return;
        }

        const contentWidth = this._activeTabRect.width;
        const progress = deltaX / contentWidth;
        this._tabs.forEach(_call.setPositionByProgress(activeIndex, progress, contentWidth));
        this.$indicator().setTransform(`translate3d(${(activeIndex * 100) + (-1 * progress * 100)}%, 0, 0)`);
        this._dragAnchorEnd = gesture.clientX;
    }

    _dragEnd(gesture) {
        const delta = (this._dragAnchorEnd - this._dragAnchorStart) / this._activeTabRect.width;
        const elapsed = gesture.timeStamp - this._dragStartTime;
        const speed = delta / elapsed * 1000;

        let newTab;
        if ((delta < -0.3 || speed < -1.2) && this._activeTab.index() < this._tabs.length - 1) {
            newTab = this._tabs[this._activeTab.index() + 1];
        } else if ((delta > 0.3 || speed > 1.2) && this._activeTab.index() > 0) {
            newTab = this._tabs[this._activeTab.index() - 1];
        } else {
            newTab = this._activeTab;
        }

        this._activateTab(newTab, true);
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

    async _activateTab(tab, force) {
        if (this._pendingAnimations) {
            await this._pendingAnimations;
        }

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
            this.emit(`tabWillActivate`, tab._id);
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
        const indicatorAnimation = this.$indicator().animate(indicatorKeyFrames, animationOptions);
        animationsFinished.push(animationPromisify(indicatorAnimation));
        this._pendingAnimations = Promise.all(animationsFinished);
        await this._pendingAnimations;
        this.$indicator().setTransform(`translate3d(${100 * activeIndex}%, 0, 0)`);
        this._pendingAnimations = null;

        if (previousActiveTabId) {
            this.emit(`tabDidDeactivate`, previousActiveTabId);
        }
        if (newActiveTabId) {
            this.emit(`tabDidActivate`, newActiveTabId);
        }
    }

    activateTabById(id) {
        return this._activateTab(this._tabs.find(_equals._id(id)));
    }
}
