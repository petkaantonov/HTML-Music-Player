import AbstractDimensionCommittedDragRecognizer from "ui/gestures/AbstractDimensionCommittedDragRecognizer";

export default class HorizontalDragRecognizer extends AbstractDimensionCommittedDragRecognizer {
    constructor(recognizerContext, fnStart, fnMove, fnEnd) {
        super(recognizerContext, fnStart, fnMove, fnEnd);
        this.dimension = AbstractDimensionCommittedDragRecognizer.HORIZONTAL;
    }
}
