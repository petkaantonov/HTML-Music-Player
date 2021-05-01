function Account(data) {
    this.id = data.account_id;
    this.name = data.name;
    this.hash = data.hash;
    this.salt = data.salt;
}

Account.prototype.matchesPassword = function(hashedPassword) {
    return this.hashedPassword === hashedPassword;
};

Account.prototype.changePassword = function(hashedPassword) {

    this.hashedPassword = hashedPassword;
};

Account.prototype.getSalt = function() {
    return this.salt;
};

module.exports = Account;
