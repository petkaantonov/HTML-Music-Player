

export default function Range(item, start, end) {
    this.start = start;
    this.end = end;
    this.item = item;
    this.progressStart = -1;
    this.progressEnd = -1;
}

Range.prototype.getInternalProgress = function(totalProgress) {
    return (totalProgress - this.progressStart) / (this.progressEnd - this.progressStart);
};
