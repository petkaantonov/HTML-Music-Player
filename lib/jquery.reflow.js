$.fn.reflow = function() {
    return this.each(function() {
        if (this.offsetWidth < -1000) {
            this.offsetWidth = this.offsetWidth;
        }
    });
};
