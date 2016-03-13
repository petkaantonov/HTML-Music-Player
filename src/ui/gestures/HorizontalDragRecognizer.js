"use strict";

import AbstractDimensionCommittedDragRecognizer from "ui/gestures/AbstractDimensionCommittedDragRecognizer";
import { inherits } from "lib/util";

export default function HorizontalDragRecognizer(recognizerMaker, fnStart, fnMove, fnEnd) {
    AbstractDimensionCommittedDragRecognizer.call(this, recognizerMaker, fnStart, fnMove, fnEnd);
    this.dimension = AbstractDimensionCommittedDragRecognizer.HORIZONTAL;
}
inherits(HorizontalDragRecognizer, AbstractDimensionCommittedDragRecognizer);
