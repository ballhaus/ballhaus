
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
var moment = require('moment');
var Flickr = require('flickrapi');
var uuid = require('node-uuid');
var xpath = require('xpath');
var dom = require('xmldom').DOMParser;
var nodemailer = require('nodemailer');
var soap = require('soap');

var config = require('./config.json');
var sha1 = require('./public/lib/sha1.js');
var site = config.site || 'ballhaus';

var sessionTimeout = 15 * 60 * 1000;

var maxImageWidth = 630;
var maxImageHeight = 420;

var app = express();

var access_logfile = fs.createWriteStream(__dirname + '/logs/access.log', { flags: 'a' });

var nsg = require('node-sprite-generator');

var objects;

app.configure(function() {
    app.use(express.logger({ stream: access_logfile }));
    app.set('port', process.env.PORT || config.port || 3000);
    app.use(express.favicon(__dirname + '/public/img/favicon-' + site + '.ico'));
    app.set('statics', process.cwd() + '/public');
    app.use(express.static(app.get('statics')));
    app.use(express.bodyParser({ keepExtensions: true, uploadDir: __dirname + '/uploads' }));
    // nsg middleware has to run after bodyParser
    app.use(nsg.middleware({
        src: [
          'public/img/menu-' + site + '/*.png',
          'public/img/service-bar/*.png',
          'public/img/newsletter/*.png',
          'public/img/media-browser/*.png'
//          'public/img/ticket*.png'
//          'public/img/kreuz*.png'
        ],
        spritePath: 'public/sprite.png',
        stylesheet: 'css',
        stylesheetPath: 'public/css/sprites.css',
        stylesheetOptions: {
            nameMapping: function (fn) {
                function activeSelector(base) {
                    return base + ':hover, .' + base + ':active, .' + base + ':focus, .' + base + '.active';
                }

                var prefixes = {
                    'menu-ada': 'site-menuitem-de',
                    'menu-ballhaus': 'site-menuitem-de'
                };
                var match = fn.match(/^public\/img\/(?:([^\/]+)\/)?([^\/]+?)(-(in)?aktiv)?.png/);
                var selector = match[2];

                if (match[1]) {
                    selector = (prefixes[match[1]] || match[1]) + '-' + selector;
                }
                if (match[3] === '-aktiv') {
                    selector = activeSelector(selector);
                }

                return selector;
            }
        }
    }));
    app.use(express.methodOverride());
    app.use(express.cookieParser(config.cookieSecret));
    app.use(express.session({cookie: { path: '/', httpOnly: true, expires: false }}));
    app.use(function (req, res, next) {
        req.botRequest = req.headers['user-agent'] && req.headers['user-agent'].match(/bot\//);
        var browserPageRequest = req.accepted
            && req.accepted.length
            && req.accepted[0].value == 'text/html'
            && !req.botRequest
            && !req.url.match('\.(jp[e]g|gif|png|css|js)$')
            && !req.url.match('^/ima?ge?/');
        if (req.method == 'POST') {
            objects = undefined;
        }
        if (req.method == 'GET') {
                if (browserPageRequest && req.url.match('^/cms')) {
                    console.log('REDIRECTING TO CMS');
                    res.render('cms');
                } else if (req.url.match('^/browser-error')) {
                    console.log('BROWSER ERROR');
                    res.render('browser-error');
                } else if (browserPageRequest && !req.url.match('^/pdf/') && !req.url.match('^/index.php')) {
                    console.log('REDIRECTING TO DYNAMIC SITE');
                    res.render('site-' + site);
                } else {
                    var crawledPath = 'crawled' + (req.url == '/' ? '/home' : req.url) + '.html';
                    fs.exists(crawledPath, function (exists) {
                        if (exists) {
                            res.sendfile(crawledPath);
                        } else {
                            next();
                        }
                    });
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
    if (req.botRequest) {
        res.redirect('/index');
    } else {
        res.render('site-' + site);
    }
});

function internal_server_error(req, res, where, error) {
    console.log('error occured at:', where, 'while handling url', req.url);
    console.log(error);
    res.send(500, 'internal server error');
}

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
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate"); // HTTP 1.1.
    res.setHeader("Pragma", "no-cache"); // HTTP 1.0.
    res.setHeader("Expires", "0"); // Proxies.
    res.send(JSON.stringify(icebox.freeze(db)));
});

app.get('/archive-db', function (req, res) {
    var oldPath = dirtyDb.path;
    var newPath;
    if (fs.existsSync(oldPath)) {
        newPath = oldPath.replace(/\.dat/, moment().format('YYYYMMDD-hhmmss') + '.dat');
        fs.renameSync(oldPath, newPath);
    }
    console.log('old path', oldPath, 'new path', newPath);
    var data = dirtyDb.get('data');
    var lastUpdate = dirtyDb.get('lastUpdate');
    dirtyDb = dirty(oldPath);
    dirtyDb.set('data', data, function () {
        dirtyDb.set('lastUpdate', lastUpdate, function () {
            res.send({status: 'ok', path: newPath});
        });
    });
});

app.post('/db', function (req, res) {
    console.log('update database');
    db = thaw(req.body);
    dirtyDb.set('data', req.body, function () {
        dirtyDb.set('lastUpdate', { name: loginStatus.name, time: (new Date).toString() }, function () {
            console.log('sending reply');
            res.send("ok");
        });
    });
});

// Image upload/download and access

app.get('/image/:name', function (req, res) {
    if (!objects) {
        objects = [];
        db.map(function(object) { objects[object.id] = object; });
    }
    var name = req.params.name;
    if (name.match(/^[0-9]+/)) {
        var image = objects[parseInt(name)];
        if (image) {
            name = image.name;
        }
    }
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
             this.size = {};
             if (size.width > size.height) {
                 this.size.width = Math.min(maxImageWidth, size.width);
                 this.size.height = Math.floor(size.height / (size.width / this.size.width));
             } else {
                 this.size.height = Math.min(maxImageHeight, size.height);
                 this.size.width = Math.floor(size.width / (size.height / this.size.height));
             }
             console.log('resizing', name, 'from', size.width, 'x', size.height, 'to', this.size.width, 'x', this.size.height);
             gm(req.files.qqfile.path)
                 .resize(this.size.width, this.size.height)
                 .write('images/' + name, this);
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
                 if (err) {
                     internal_server_error(req, res, 'cannot make thumbnail', err);
                 } else {
                     res.json({ success: true,
                                image: image
                              });
                 }
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
            if (err) {
                internal_server_error(req, res, 'cannot read logo/ directory', err);
            } else {
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
            }
        },
        function (err, images) {
            if (err) {
                internal_server_error(req, res, 'creating logos failed', err);
            } else {
                res.json({
                    success: true,
                    logos: images.filter(function (image) { return image; })
                });
            }
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
             if (err) {
                 internal_server_error(req, res, 'repo.status', err);
             } else {
                 this.status = status;
                 repo.commits('HEAD', 1, this);
             }
         },
         function (err, commits) {
             if (err) {
                 internal_server_error(req, res, 'repo.commits', err);
             } else {
                 res.send({ status: this.status,
                            lastCommit: commits[0]
                          });
             }
         });
});

function forwardJson (url, req, res) {
    restler.get(url).on('complete', function (data) {
        res.send(data);
    });
}

var flickr;
Flickr.tokenOnly({ api_key: config.flickr.apiKey },
                 function (err, flickr_) {
                     if (err) throw(err);
                     flickr = flickr_;
                 });

app.get('/flickr-sets', function (req, res) {
    flickr.photosets.getList({ user_id: config.flickr.userId },
                             function (error, response) {
                                 if (error) {
                                     internal_server_error(req, res, 'flickr.photosets.getList', error);
                                 } else {
                                     res.send(response.photosets.photoset);
                                 }
                             });
});

app.get('/flickr-set/:setId', function (req, res) {
    var setId = req.params.setId;
    flickr.photosets.getPhotos({ photoset_id: setId,
                                 extras: 'license,date_upload,date_taken,owner_name,icon_server,original_format,last_update,geo,tags,machine_tags,o_dims,views,media,path_alias,url_sq,url_t,url_s,url_m,url_o' },
                               function (error, response) {
                                   if (error) {
                                       internal_server_error(req, res, 'flickr.photosets.getPhotos', error);
                                   } else {
                                       res.send(response.photoset.photo);
                                   }
                               });
});

app.get('/download-flickr-set/:setId', function (req, res) {
    var setId = req.params.setId;
    Step(
        function () {
            flickr.photosets.getPhotos({ photoset_id: setId,
                                         extras: 'url_m' },
                                       this);
        },
        function (error, response) {
            if (error) {
                internal_server_error(req, res, 'flickr.photosets.getPhotos', error);
            } else {
                var group = this.group();
                response.photoset.photo.forEach(function (photo) {
                    var url = photo.url_m;
                    var filename = url.replace(/.*\//, '');
                    Image.importFromWeb(url, filename, group());
                });
            }
        },
        function (err, images) {
            if (err) {
                internal_server_error(req, res, 'Image.importFromWeb', err);
            } else {
                res.send(icebox.freeze(images));
            }
        });
});

app.get('/video',
        function (req, res) {
            var page = 1;
            var videos = [];

            function getNextPage() {
                console.log('get page ', page, ' of the videos');
                restler.get('http://vimeo.com/api/v2/' + config.vimeoUserName + '/videos.json?page=' + page++)
                    .on('complete', function(data, response) {
                        if (response.statusCode == 403) {
                            res.send(videos);
                        } else {
                            videos = videos.concat(data);
                            getNextPage();
                        }
                    });
            }

            getNextPage();
        });

app.get('/ticket-data',
        function (req, res) {
            var chunk_size = 200;
            var page = 0;
            var tickets = [];

            function getNextPage() {
                restler.get('https://api.reservix.de/1/sale/event?api-key=' + config.reservixApiKey + '&limit=' + chunk_size + '&page=' + page++)
                    .on('complete', function (data) {
                        if (data.errorCode) {
                            console.log('error', data.errorCode, 'getting ticket data:', data.errorMessage);
                            res.send(data.errorCode, data.errorMessage);
                        } else {
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
                        }
                    });
            }

            getNextPage();
        });

var mailer = nodemailer.createTransport("Sendmail", "/usr/sbin/sendmail");

function subscribeNewsletter(email, doidata, handler) {
    try {
        Step(
            function () {
                soap.createClient(config.cleverreach.url, this);
            },
            function(err, client) {
                if (err) {
                    handler(err);
                } else {
                    this.client = client;
                    this.client.receiverAdd({ apiKey: config.cleverreach.apiKey,
                                              groupId: config.cleverreach.groupId,
                                              subscriberData: {
                                                  email: email,
                                                  active: false,
                                                  deactivated: 1
                                              }
                                            }, this);
                }
            },
            function(err, result) {
                if (err) {
                    handler(err);
                } else {
                    console.log('receiverAdd result', result);
                    this.client.formsSendActivationMail({ apiKey: config.cleverreach.apiKey,
                                                          formId: config.cleverreach.formId,
                                                          email: email,
                                                          doidata: doidata
                                                        }, this);
                }
            },
            function (err, result) {
                if (err) {
                    handler(err);
                } else {
                    console.log('formsSendActivationMail result', result);
                    handler(undefined, result);
                }
            });
    }
    catch (e) {
        handler(e);
    }
        
}

function unsubscribeNewsletter(email, handler) {
    Step(
        function () {
            soap.createClient(config.cleverreach.url, this);
        },
        function (err, client) {
            if (err) {
                handler(err);
            } else {
                this.client = client;
                this.client.receiverDelete({ apiKey: config.cleverreach.apiKey,
                                             groupId: config.cleverreach.groupId,
                                             email: email },
                                           this);
            }
        },
        function (err, result) {
            if (err) {
                handler(err);
            } else {
                console.log('done', result);
                handler(undefined, result);
            }
        });
}

app.post('/newsletter-subscription', function (req, res) {
    subscribeNewsletter(req.body.address,
                        {
                            user_ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
                            user_agent: req.headers['user-agent'],
                            referer: req.headers['referer']
                        },
                        function (err, data) {
                            if (err) {
                                mailer.sendMail({
                                    from: 'ballhaus@netzhansa.com',
                                    to: ['hans.huebner@gmail.com'],
                                    subject: 'Fehler beim Newsletter abbonieren',
                                    text: JSON.stringify(err) + "\n\n" + JSON.stringify(data)
                                });
                            }
                            res.send({ success: !err });
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
	     function login_failed (status, message) {
		 console.log('POST /login', status, message);
		 res.send(status, message);
	     }
             if (loginStatus.name) {
                 login_failed(400, 'Daten werden gerade von ' + loginStatus.name + ' bearbeitet');
             } else if (req.body.name && !req.body.name.match(/^[a-z0-9]+$/)) {
                 login_failed(400, 'Ungültiger Benutzername');
             } else if (req.session.user && (req.body.password == sha1.sha1(req.session.user.password + req.session.salt))) {
                 loginStatus = { name: req.body.name,
                                 superuser: req.session.user.superuser,
                                 uuid: uuid.v1() };
                 console.log(loginStatus.name, 'logged in');
                 req.session.loggedIn = true;
                 res.json(loginStatus);
             } else {
                 login_failed(401, 'Invalid login');
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

http.createServer(app).listen(app.get('port'), function() {
    console.log("Express server listening on port " + app.get('port'));
});

