importScripts("worker_api.js");
importScripts("ebur128.js");

deployApi({
    initializeEbur128Calculation: ebur128.initializeEbur128Calculation,
    addFrames: ebur128.addFrames,
    getEbur128: ebur128.getEbur128,
    cancelEbur128Calculation: ebur128.cancelEbur128Calculation,
    getAlbumGain: ebur128.getAlbumGain
});
