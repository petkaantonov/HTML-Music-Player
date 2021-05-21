export const sleep = (function () {
    const buf = new Int32Array(new SharedArrayBuffer(4));
    buf[0] = 0;
    return function (ms: number) {
        return Atomics.wait(buf, 0, 0, ms);
    };
})();
