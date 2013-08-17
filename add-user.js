var path = require('path');
var fs = require('fs');
var read = require('read');
var Step = require('step');
var uuid = require('node-uuid');
var sha1 = require('./public/lib/sha1.js');

var user = { salt: uuid.v1() };
Step(
    function () {
        read({ prompt: 'Username: ' }, this);
    },
    function (err, name) {
        user.name = name;
        read({ prompt: 'Email: ' }, this);
    },
    function (err, email) {
        user.email = email;
        read({ prompt: 'Password: ', silent: true }, this);
    },
    function (err, password) {
        this.password = password;
        read({ prompt: 'Repeat password: ', silent: true }, this);
    },
    function (err, password) {
        if (this.password == password) {
            user.password = sha1.sha1(password + user.salt);
            var userPath = path.resolve('users/' + user.name + '.json');
            fs.writeFileSync(userPath, JSON.stringify(user));
            console.log('User', user.name, 'was created');
        } else {
            console.log('Passwords did not match');
        }
    });
