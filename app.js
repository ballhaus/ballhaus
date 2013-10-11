
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
var gm = require('gm');
var Flickr = require('flickr').Flickr;
var uuid = require('node-uuid');
var xpath = require('xpath');
var dom = require('xmldom').DOMParser;

var config = require('./config.json');
var sha1 = require('./public/lib/sha1.js');

var sessionTimeout = 15 * 60 * 1000;

var flickr = new Flickr(config.flickr.apiKey, '');

var app = express();

var access_logfile = fs.createWriteStream(__dirname + '/logs/access.log', { flags: 'a' });

app.configure(function() {
    app.use(express.logger({ stream: access_logfile }));
    app.set('port', process.env.PORT || config.port || 3000);
    app.use(express.favicon(__dirname + '/public/img/favicon.ico'));
    app.set('statics', process.cwd() + '/public');
    app.use(express.static(app.get('statics')));
    app.use(express.bodyParser({ keepExtensions: true, uploadDir: __dirname + '/uploads' }));
    app.use(express.methodOverride());
    app.use(express.cookieParser(config.cookieSecret));
    app.use(express.session({cookie: { path: '/', httpOnly: true, expires: false }}));
    app.use(function (req, res, next) {
        if (req.accepted && req.accepted.length && req.accepted[0].value == 'text/html' && req.method == 'GET') {
                if (req.url.match('^/cms')) {
                    console.log('REDIRECTING TO CMS');
                    res.render('cms');
                } else if (req.url.match('^/browser-error')) {
                    console.log('BROWSER ERROR');
                    res.render('browser-error');
                } else if (!req.url.match('^/pdf/') && !req.url.match('^/index.php')) {
                    console.log('REDIRECTING TO DYNAMIC SITE');
                    res.render('site');
                } else {
                    next();
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
var Person = thaw.Person;

var loginStatus = {};

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
    console.log('update database');
    fs.appendFileSync('database-debug.log', JSON.stringify(req.body) + "\n");
    db = thaw(req.body);
    dirtyDb.set('data', req.body);
    dirtyDb.set('lastUpdate', { name: loginStatus.name, time: (new Date).toString() });
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

// Logo Upload/Download
app.get('/logo/:name', function (req, res) {
    var name = req.params.name;
    var filename = path.resolve("logo/" + name);
    fs.stat(filename, function (err) {
        if (err) {
            res.send(404);
        } else {
            res.sendfile(filename);
        }
    });
});

app.post('/logo', function (req, res) {
    var name = req.files.qqfile.name;
    fs.renameSync(req.files.qqfile.path, 'logo/' + name);
    res.json({
        success: true,
        logo: name
    });
});

app.delete('/logo/:name', function (req, res) {
    var name = req.params.name;
    fs.unlink('logo/' + name);
    res.json({
        success: true,
        logo: name
    });
});

app.get('/logos', function (req, res) {
    Step(
        function () { fs.readdir('logo/', this) },
        function (err, files) {
            if (err) throw err;
            var group = this.group();
            files.forEach(function (file) {
                var handler = group();
                gm('logo/' + file).size(function (err, image) {
                    if (err) {
                        handler(null, null);
                    } else {
                        image.filename = file;
                        handler(null, image);
                    }
                });
            });
        },
        function (err, images) {
            res.json({
                success: true,
                logos: images.filter(function (image) { return image; })
            });
        });
});

// PDF Upload/Download
app.get('/pdf/:name', function (req, res) {
    var name = req.params.name;
    var filename = path.resolve("pdf/" + name);
    fs.stat(filename, function (err) {
        if (err) {
            res.send(404);
        } else {
            res.sendfile(filename);
        }
    });
});

app.post('/pdf', function (req, res) {
    var name = req.files.qqfile.name;
    fs.renameSync(req.files.qqfile.path, 'pdf/' + name);
    res.json({
        success: true,
        pdf: name
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

var mailer = require('nodemailer').createTransport("Sendmail", "/usr/sbin/sendmail");

app.post('/newsletter-subscription', function (req, res) {
    console.log(req.body);
    req.body.address
    mailer.sendMail({
        from: req.body.address,
        to: ['hallo@ballhausnaunynstrasse.de'],
        subject: 'Newsletter abonnieren',
        text: 'Ich möchte bitte euren Newsletter abonnieren'
    }, function (error, response) {
        res.send({success: !error});
    });
});

var redirects = { '21/810': '/stueck/liga_der_verdammten' };

app.get('/index.php', function (req, res) {
    var id = req.query.id;
    var evt = req.query.evt;
    var key = id + '/' + evt;
    console.log('key', key, 'redirects', redirects[key]);
    res.redirect(301, redirects[key] || '/');
});
    

// //////////////////////////////////////////////////////////////////////

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

var timeoutId;

function sessionTimedOut() {
    console.log(loginStatus.name, 'session time out');
    loginStatus = {};
}

function touchSession() {
    if (timeoutId) {
        clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(sessionTimedOut, sessionTimeout);
}

app.get('/login-status',
        function (req, res) {
            if (req.session
                && req.session.loggedIn
                && (req.session.lastUrl != req.query.url)) {
                req.session.lastUrl = req.query.url;
                touchSession();
            }
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
                 console.log(loginStatus.name, 'logged in');
             } else {
                 res.send(401, 'Invalid login');
             }
         });

app.post('/logout',
         function (req, res) {
             if (!req.session.loggedIn && !req.query.force) {
                 res.send(400, 'Nicht angemeldet');
             } else {
                 console.log(loginStatus.name, 'logged out');
                 loginStatus = {};
                 res.json({});
             }
         });

// Import legacy artists
app.post('/import-legacy-artists',
         function (req, res) {
             var people;
             console.log('req.files.file', req.files.file.path);
             Step(
                 function () {
                     var doc = new dom().parseFromString(fs.readFileSync(req.files.file.path, 'utf8'));
                     people = xpath.select('/people/person[picture/path != "" and bio != "" and name != ""]', doc);
                     var group = this.group();
                     people.forEach(function (person) {
                         var path = xpath.select('picture/path/text()', person).toString();
                         var localPath = path.replace(/.*\//, '');
                         Image.importFromWeb('http://old.ballhausnaunynstrasse.de/' + path,
                                             localPath,
                                             group());
                         
                     });
                 },
                 function (err, images) {
                     if (err) throw err;
                     res.json(people.map(function (person) {
                         var name = xpath.select('name/text()', person).toString();
                         var credits = xpath.select('picture/credits/text()', person).toString();
                         var bio = xpath.select('bio/p', person).map(function (node) { return node.toString(); }).join("\n");
                         var image = images.shift();
                         image.credits = credits;
                         return new Person({ name: name,
                                             bio: { de: bio },
                                             image: image });
                     }));
                 });
         });

http.createServer(app).listen(app.get('port'), function() {
    console.log("Express server listening on port " + app.get('port'));
});

