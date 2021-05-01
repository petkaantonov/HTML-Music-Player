import { SelectDeps } from "ui/Application";
import { Track } from "ui/metadata/MetadataManagerFrontend";
import Page, { DelegatedEvent, DomWrapper } from "ui/platform/dom/Page";
import GestureObject from "ui/ui/gestures/GestureObject";
import GestureRecognizerContext from "ui/ui/gestures/GestureRecognizerContext";
import TapRecognizer from "ui/ui/gestures/TapRecognizer";
import Rippler from "ui/ui/Rippler";

const HTML = `<div class='track-rating'>                                                               \
        <div data-rating='1' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='2' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='3' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='4' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='5' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
    </div>`;

function addClassToRatingsAtLeast(inputs: DomWrapper, value: number, className: string) {
    inputs.filter(elem => +elem.dataset!.rating! <= value).addClass(className);
}

type TrackRaterDeps = SelectDeps<"page" | "recognizerContext" | "rippler">;
type TrackRaterOpts = {
    zIndex: number;
};

export default class TrackRater {
    page: Page;
    recognizerContext: GestureRecognizerContext;
    rippler: Rippler;
    track: any;
    _domNode: DomWrapper;
    _tapRecognizer: TapRecognizer;
    _enabled: boolean;
    _rippleZIndex: number;
    _doubleClickedDelegate: (e: MouseEvent) => void;
    _clickedDelegate: (e: MouseEvent) => void;
    _tappedDelegate: (e: GestureObject) => void;
    _hoveredDelegate: (e: MouseEvent) => void;

    constructor(opts: TrackRaterOpts, deps: TrackRaterDeps) {
        this.page = deps.page;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;
        this.track = null;
        this._domNode = this.page.parse(HTML);
        this._doubleClickedDelegate = this.page.delegatedEventHandler<MouseEvent>(
            this._doubleClicked,
            `.rating-input`,
            this
        );
        this._clickedDelegate = this.page.delegatedEventHandler<MouseEvent>(this._clicked, `.rating-input`, this);
        this._tappedDelegate = this.page.delegatedEventHandler<GestureObject>(this._clicked, `.rating-input`, this);
        this._hoveredDelegate = this.page.delegatedEventHandler<MouseEvent>(this._hovered, `.rating-input`, this);
        this._tapRecognizer = this.recognizerContext.createTapRecognizer(this._tappedDelegate);
        this._update(-1);
        this._enabled = false;
        this._rippleZIndex = opts.zIndex;
    }

    $() {
        return this._domNode;
    }

    setRippleZIndex(rippleZIndex: number) {
        this._rippleZIndex = rippleZIndex;
    }

    _hovered(e: DelegatedEvent<MouseEvent>) {
        const inputs = this.$().find(`.rating-input`).removeClass(`hovered`);

        if (e.type === `mouseleave`) {
            const related = this.page.$(e.relatedTarget as HTMLElement);
            if (related.is(`.rating-input`)) {
                const value = +(e.relatedTarget as HTMLElement).dataset!.rating!;
                addClassToRatingsAtLeast(inputs, value, `hovered`);
            }
        } else if (e.type === `mouseenter`) {
            const value = +e.delegateTarget.dataset!.rating!;
            addClassToRatingsAtLeast(inputs, value, `hovered`);
        }
    }

    disable() {
        this.track = null;
        this._update(-1);
        if (!this._enabled) {
            return;
        }
        this._enabled = false;
        this.$()
            .removeEventListener(`click`, this._clickedDelegate)
            .removeEventListener(`mouseenter`, this._hoveredDelegate)
            .removeEventListener(`mouseleave`, this._hoveredDelegate)
            .removeEventListener(`dblclick`, this._doubleClickedDelegate);
        this._tapRecognizer.unrecognizeBubbledOn(this.$());
    }

    update() {
        if (this.track) {
            this._update(this.track.getRating());
        }
    }

    enable(track: Track) {
        this.track = track;
        this._update(this.track.getRating());
        if (this._enabled) {
            return;
        }
        this._enabled = true;
        this.$()
            .addEventListener(`click`, this._clickedDelegate)
            .addEventListener(`mouseenter`, this._hoveredDelegate)
            .addEventListener(`mouseleave`, this._hoveredDelegate)
            .addEventListener(`dblclick`, this._doubleClickedDelegate);
        this._tapRecognizer.recognizeBubbledOn(this.$());
    }

    _clicked(e: DelegatedEvent<MouseEvent | GestureObject>) {
        this.rippler.rippleElement(e.delegateTarget, e.clientX, e.clientY, undefined, this._rippleZIndex);
        this._ratingInputClicked(e.delegateTarget);
    }

    _doubleClicked(_e: MouseEvent) {
        this.track.rate(-1);
        this._update(-1);
    }

    _update(value: number) {
        const inputs = this.$().find(`.rating-input`).removeClass(`rated`);
        addClassToRatingsAtLeast(inputs, value, `rated`);
    }

    _ratingInputClicked(node: HTMLElement) {
        const value = +node.dataset!.rating!;
        this.track.rate(value);
        this._update(value);
    }
}
