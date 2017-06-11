

export default function Move(x, y) {
    this.x = x;
    this.y = y;
}

Move.prototype.yAt = function() {
    return this.y;
};

Move.prototype.xAt = function() {
    return this.x;
};

Move.prototype.startX = function() {
    return this.x;
};

Move.prototype.startY = function() {
    return this.y;
};

Move.prototype.endX = function() {
    return this.x;
};

Move.prototype.endY = function() {
    return this.y;
};
