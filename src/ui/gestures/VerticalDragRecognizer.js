"use strict";

import AbstractDimensionCommittedDragRecognizer from "ui/gestures/AbstractDimensionCommittedDragRecognizer";
import { inherits } from "util";

export default function VerticalDragRecognizer(recognizerContext, fnStart, fnMove, fnEnd) {
    AbstractDimensionCommittedDragRecognizer.call(this, recognizerContext, fnStart, fnMove, fnEnd);
    this.dimension = AbstractDimensionCommittedDragRecognizer.VERTICAL;
}
inherits(VerticalDragRecognizer, AbstractDimensionCommittedDragRecognizer);
