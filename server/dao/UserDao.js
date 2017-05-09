const User = require("../model/User");

function UserDao(sql) {
    this.sql = sql;
}

UserDao.prototype.getUserById = function(id) {
    return this.sql.getConnectionAsync().then(connection => connection.queryAsync("SELECT * FROM user WHERE id=?", id)
        .then(results => {
            if (!results.length) {
                return null;
            } else {
                return new User(results[0]);
            }
        })
        .finally(connection.release.bind(connection)));
};

module.exports = UserDao;
