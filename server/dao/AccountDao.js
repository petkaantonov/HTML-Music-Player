const Account = require("../model/Account");

function AccountDao(sql) {
    this.sql = sql;
}

AccountDao.prototype.getAccountById = function(id) {
    return this.sql.withConnectionAsync(connection => connection.queryAsync("SELECT * FROM account WHERE account_id=?", id)
        .then(results => results.length > 0 ? new Account(results[0]) : null));
};

AccountDao.prototype.getAccountByName = function(name) {
    return this.sql.withConnectionAsync(connection => connection.queryAsync("SELECT * FROM account WHERE name=?", name)
        .then(results => results.length > 0 ? new Account(results[0]) : null));
};

module.exports = AccountDao;
