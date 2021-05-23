import AbstractDimensionCommittedDragRecognizer from "ui/ui/gestures/AbstractDimensionCommittedDragRecognizer";

import GestureRecognizerContext, { GestureHandler } from "./GestureRecognizerContext";

export default class VerticalDragRecognizer extends AbstractDimensionCommittedDragRecognizer {
    constructor(
        recognizerContext: GestureRecognizerContext,
        fnStart: GestureHandler,
        fnMove: GestureHandler,
        fnEnd: GestureHandler
    ) {
        super(recognizerContext, fnStart, fnMove, fnEnd);
        this.dimension = AbstractDimensionCommittedDragRecognizer.VERTICAL;
    }
}