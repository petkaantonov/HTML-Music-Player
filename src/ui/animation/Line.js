

export default function Line(x1, y1, x2, y2, progress) {
    if (progress === undefined) progress = 1;
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.progress = progress;
}

Line.prototype.xAt = function(progress) {
    return this.x1 + ((this.x2 - this.x1) * progress);
};

Line.prototype.yAt = function(progress) {
        return this.y1 + ((this.y2 - this.y1) * progress);
};

Line.prototype.startX = function() {
    return this.x1;
};

Line.prototype.startY = function() {
    return this.y1;
};

Line.prototype.endX = function() {
    return this.x2;
};

Line.prototype.endY = function() {
    return this.y2;
};
