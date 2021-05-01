export default function patch() {
    if (!AudioContext.prototype.suspend) {
        AudioContext.prototype.suspend = function () {
            return Promise.resolve();
        };
    }
    if (!AudioContext.prototype.resume) {
        AudioContext.prototype.resume = function () {
            return Promise.resolve();
        };
    }
}
