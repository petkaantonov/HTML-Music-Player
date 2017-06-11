var Promise = require("bluebird");
var fs = Promise.promisifyAll(require("fs"));
var express = require("express");
var https = Promise.promisifyAll(require("https"));
var morgan = require("morgan");
var pem = Promise.promisifyAll(require("pem"));
var minimist = require("minimist");
var argv = minimist(process.argv.slice(2));
var serveStatic = require('serve-static')

function sanitizeHostname(hn) {
    return (hn + "").replace(/[^a-zA-Z0-9\.\-]+/g, "");
}

var port = +process.env.npm_package_config_devServerPort || +argv.port || process.env.SOITA_PORT || 4443;
var commonName = sanitizeHostname(process.env.npm_package_config_devServerName || argv.commonName || process.env.SOITA_COMMON_NAME || "localhost");
var host = sanitizeHostname(process.env.npm_package_config_devServerHost || argv.host || process.env.SOITA_HOSTNAME || "0.0.0.0");
var cwd = process.cwd();
process.chdir("scripts");

Promise.join(
    fs.readFileAsync(commonName + "-key.pem"),
    fs.readFileAsync(commonName + "-cert.pem"),
    fs.readFileAsync(commonName + "-csr.pem"), function(key, cert, csr) {
    return {key: key, cert: cert, csr: csr};
}).catch({code: "ENOENT"}, function(e) {
    console.log("generating certs");
    return pem.createCertificateAsync({
        days: 365,
        country: "US",
        state: commonName,
        locality: commonName,
        organization: commonName,
        organizationUnit: commonName,
        commonName: commonName,
        altNames: [commonName],
        emailAddress: commonName+"@" + commonName,
        selfSigned: true
    }).then(function(keys) {
        var key = keys.serviceKey;
        var cert = keys.certificate;
        var csr = keys.csr;

        return Promise.all([
            fs.writeFileAsync(commonName + "-key.pem", key),
            fs.writeFileAsync(commonName + "-cert.pem", cert),
            fs.writeFileAsync(commonName + "-csr.pem", csr)
        ]).then(function() {
            return {key: key, cert: cert, csr: csr};
        });
    });
}).then(function(keys) {
    process.chdir(cwd);
    var app = express();
    app.use(morgan("combined"));

    app.use("/", serveStatic(cwd, {
        dotfiles: "deny",
        setHeaders: function(res) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
        }
    }));



    return https.createServer({
        key: keys.key,
        cert: keys.cert
    }, app).listenAsync(port, host);
}).then(function() {
    console.log("listening on ", host + ":" + port);
})
