const Device = require("../model/Device");

function DeviceDao(sql) {
    this.sql = sql;
}

DeviceDao.prototype.isValidDeviceForAccount = function(clientSideId, accountName) {
    const sql = `SELECT client_side_id
                 FROM device d
                 INNER JOIN account a ON a.account_id = d.account_id
                 WHERE d.client_side_id = ? AND a.name = ?`;
    return this.sql.withConnectionAsync(connection => connection.queryAsync(sql, [clientSideId, accountName]).then(
                            results => results.length > 0 && results[0].client_side_id === clientSideId));
};
