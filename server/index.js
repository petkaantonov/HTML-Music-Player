const argv = require("yargs").argv;
const Promise = require("bluebird");
const mysql = Promise.promisifyAll(require("mysql"));
const util = require("./util/util");
const env = process.env.NODE_ENV|| "development";

const UserDao = require("./dao/UserDao");

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

const userDao = new UserDao(pool);
