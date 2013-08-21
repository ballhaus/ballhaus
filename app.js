
/**
 * Module dependencies.
 */

var path = require('path');
var fs = require('fs');
var events = require('events');
var util = require('util');
var express = require('express');
var http = require('http');
var notemplate = require('express-notemplate');
var Step = require('step');
var gift = require('gift');
var restler = require('restler');
var dirty = require('dirty');
var icebox = require('icebox');
var httpGet = require('http-get');
var gm = require('gm');
var Flickr = require('flickr').Flickr;
var uuid = require('node-uuid');
var config = require('./config.json');
var sha1 = require('./public/lib/sha1.js');

var flickr = new Flickr(config.flickr.apiKey, '');

var app = express();

app.configure(function() {
    app.set('port', process.env.PORT || config.port || 3000);
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.set('statics', process.cwd() + '/public');
    app.use(express.static(app.get('statics')));
    app.use(express.bodyParser({ keepExtensions: true, uploadDir: __dirname + '/uploads' }));
    app.use(express.methodOverride());
    app.use(express.cookieParser(config.cookieSecret));
    app.use(express.session());
    app.use(function (req, res, next) {
        if (req.accepted && req.accepted.length && req.accepted[0].value == 'text/html') {
                if (req.url.match('^/cms')) {
                    console.log('REDIRECTING TO CMS');
                    res.render('cms');
                } else {
                    console.log('REDIRECTING TO SITE');
                    res.render('site');
                }
        } else {
            next();
        }
    });
    app.use(app.router);
    app.set('views', process.cwd() + '/views');
    app.use('/uploads', express.static(__dirname + '/uploads'));
    app.engine('html', notemplate.__express);
    app.set('view engine', 'html');
});

app.configure('development', function() {
    app.use(express.errorHandler());
});

app.get('/', function (req, res) {
    res.render('site');
});

var thaw = require('./thaw');
var Image = thaw.Image;

var db;
var dirtyDb = dirty(path.resolve('ballhaus.dat'));
dirtyDb.on('load', function () {
    console.log('database has been loaded');
    db = thaw(dirtyDb.get('data'));
});

app.get('/db', function (req, res) {
    res.send(icebox.freeze(db));
});

app.post('/db', function (req, res) {
    console.log('update', req.body);
    db = thaw(req.body);
    dirtyDb.set('data', req.body);
    res.send("ok");
});

// Image upload/download

app.get('/image/:name', function (req, res) {
    var name = req.params.name;
    var filename = path.resolve((req.query.thumbnail ? 'thumbnails/' : 'images/') + name);
    fs.stat(filename, function (err) {
        if (err) {
            res.send(404);
        } else {
            res.sendfile(filename);
        }
    });
});

app.post('/image', function (req, res) {
    var name = req.files.qqfile.name;
    Step(function () { gm(req.files.qqfile.path).size(this); },
         function (err, size) {
             if (err) {
                 res.json(400, {
                     success: false,
                     message: err.toString()
                 });
                 return;
             }                 
             this.size = size;
             fs.rename(req.files.qqfile.path, 'images/' + name, this);
         },
         function (err) {
             if (err) {
                 res.json(400, {
                     success: false,
                     message: err.toString()
                 });
                 return;
             }
             var image = new Image({ name: name,
                                     width: this.size.width,
                                     height: this.size.height
                                   });
             image.makeThumbnail(function (err) {
                 if (err) throw err;
                 res.json(icebox.freeze({
                     success: true,
                     image: image
                 }))
             });
         });
});

var repo = gift('.');

app.get('/version', function (req, res) {
    Step(function () { repo.status(this); },
         function (err, status) {
             if (err) throw err;
             this.status = status;
             repo.commits('HEAD', 1, this);
         },
         function (err, commits) {
             if (err) throw err;
             res.send({ status: this.status,
                        lastCommit: commits[0]
                      });
         });
});

function forwardJson (url, req, res) {
    restler.get(url).on('complete', function (data) {
        res.send(data);
    });
}

app.get('/flickr-sets', function (req, res) {
    flickr.executeAPIRequest('flickr.photosets.getList',
                             { user_id: config.flickr.userId },
                             false,
                             function (error, response) {
                                 if (error) throw error;
                                 res.send(response.photosets.photoset);
                             });
});
app.get('/flickr-set/:setId', function (req, res) {
    var setId = req.params.setId;
    flickr.executeAPIRequest('flickr.photosets.getPhotos',
                             { photoset_id: setId,
                               extras: 'license,date_upload,date_taken,owner_name,icon_server,original_format,last_update,geo,tags,machine_tags,o_dims,views,media,path_alias,url_sq,url_t,url_s,url_m,url_o' },
                             false,
                             function (error, response) {
                                 if (error) throw error;
                                 res.send(response.photoset.photo);
                             });
});

app.get('/download-flickr-set/:setId', function (req, res) {
    var setId = req.params.setId;
    Step(
        function () {
            flickr.executeAPIRequest('flickr.photosets.getPhotos',
                                     { photoset_id: setId,
                                       extras: 'url_m' },
                                     false,
                                     this)
        },
        function (error, response) {
            if (error) throw error;
            var group = this.group();
            response.photoset.photo.forEach(function (photo) {
                var url = photo.url_m;
                var filename = url.replace(/.*\//, '');
                Image.importFromWeb(url, filename, group());
            });
        },
        function (err, images) {
            if (err) throw err;
            res.send(icebox.freeze(images));
        });
});

app.get('/video', forwardJson.bind(this, 'http://vimeo.com/api/v2/' + config.vimeoUserName + '/videos.json'));
app.get('/tickets',
        function (req, res) {
            var chunk_size = 200;
            var page = 0;
            var tickets = [];

            function getNextPage() {
                restler.get('https://www.reservix.de/api/1/sale/event?api-key=' + config.reservixApiKey + '&limit=' + chunk_size + '&page=' + page++)
                    .on('complete', function (data) {
                        tickets = tickets.concat(data.data);
                        if (data.limit < chunk_size) {
                            for (var i in tickets) {
                                var ticket = tickets[i];
                                ticket.date_time = ticket.startdate + ' ' + ticket.starttime + ':00';
                            }
                            res.send(tickets);
                        } else {
                            getNextPage();
                        }
                    });
            }

            getNextPage();
        });

var loginStatus = {};
var bogusUserSalts = {};

// CMS user passwords are hashed on the client side and only the
// hashes are stored on the server.  This is done to prevent sending
// and storing cleartext passwords.

function loadUser(name) {
    var userPath = path.resolve('users/' + name + '.json');
    if (fs.existsSync(userPath)) {
        return require(userPath);
    }
}

app.get('/login-status',
        function (req, res) {
            res.json(loginStatus);
        });

app.get('/user-salt/:name',
        function (req, res) {
            var name = req.params.name;
            var user = loadUser(name);
            var userSalt;
            if (user) {
                userSalt = user.salt;
            } else {
                if (!bogusUserSalts[name]) {
                    bogusUserSalts[name] = uuid.v1();
                }
                userSalt = bogusUserSalts[name];
            }
            req.session.salt = uuid.v1();
            req.session.user = user;
            res.json({ userSalt: userSalt,
                       sessionSalt: req.session.salt
                     });
        });

app.post('/login',
         function (req, res) {
             if (loginStatus.name) {
                 res.send(400, 'Daten werden gerade von ' + loginStatus.name + ' bearbeitet');
             } else if (req.body.name && !req.body.name.match(/^[a-z0-9]+$/)) {
                 res.send(400, 'Ungültiger Benutzername');
             } else if (req.session.user && (req.body.password == sha1.sha1(req.session.user.password + req.session.salt))) {
                 loginStatus = { name: req.body.name,
                                 superuser: req.session.user.superuser,
                                 uuid: uuid.v1() };
                 req.session.loggedIn = true;
                 res.json(loginStatus);
             } else {
                 res.send(401, 'Invalid login');
             }
         });

app.post('/logout',
         function (req, res) {
             if (!req.session.loggedIn) {
                 res.send(400, 'Nicht angemeldet');
             } else {
                 loginStatus = {};
                 res.json({});
             }
         });

http.createServer(app).listen(app.get('port'), function() {
    console.log("Express server listening on port " + app.get('port'));
});
