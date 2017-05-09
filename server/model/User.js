
function User(data) {
    this.id = data.id;
    this.password = data.password;
}

User.prototype.matchesPassword = function(password) {

};

module.exports = User;
