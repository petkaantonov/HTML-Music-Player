const Promise = require("../lib/bluebird");
Promise.config({
    // Enable warnings.
    warnings: false,
    // Enable long stack traces.
    longStackTraces: true,
    // Enable cancellation.
    cancellation: true
});
