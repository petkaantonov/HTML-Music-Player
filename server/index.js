const argv = require("yargs").argv;
const Promise = require("bluebird");
const mysql = Promise.promisifyAll(require("mysql"));
const util = require("./util/util");
const env = process.env.NODE_ENV|| "development";

const AccountDao = require("./dao/AccountDao");
const DeviceDao = require("./dao/DeviceDao");

const mySqlOptions = {
    host: argv.mySqlHost || "localhost",
    port: argv.mySqlPort || 3306,
    user: argv.mySqlUser,
    password: argv.mySqlPassword,
    database: argv.mySqlDatabase,
    charset: "utf8mb4",
    timezone: "Z",
    connectTimeout: 30 * 1000,
    trace: false,

    acquireTimeout: 30 * 1000,
    connectionLimit: env === "development" ? 1 : 4
};

const pool = mysql.createPool(mySqlOptions);
pool.withConnectionAsync = function(callback) {
    return Promise.using(this.getConnectionAsync().disposer(function(connection) {
        try {
            connection.release();
        } catch (e) {}
    }), callback);
};

const accountDao = new AccountDao(pool);
