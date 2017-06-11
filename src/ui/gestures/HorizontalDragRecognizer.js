

import AbstractDimensionCommittedDragRecognizer from "ui/gestures/AbstractDimensionCommittedDragRecognizer";
import {inherits} from "util";

export default function HorizontalDragRecognizer(recognizerContext, fnStart, fnMove, fnEnd) {
    AbstractDimensionCommittedDragRecognizer.call(this, recognizerContext, fnStart, fnMove, fnEnd);
    this.dimension = AbstractDimensionCommittedDragRecognizer.HORIZONTAL;
}
inherits(HorizontalDragRecognizer, AbstractDimensionCommittedDragRecognizer);
