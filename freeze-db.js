var path = require('path');
var fs = require('fs');
var dirty = require('dirty');
var icebox = require('icebox');
var Step = require('step');
var gm = require('gm');

var db = {};
var dbDirectory = path.resolve("../data/");

function readObjects(dir) {
    console.log('reading', dir, 'objects');
    db[dir] = {};
    var count = 0;
    fs.readdirSync(dbDirectory + '/' + dir).forEach(function (file) {
        file.replace(/^(\d+)\.json$/, function(match, id) {
            id = parseInt(id);
            try {
                var object = JSON.parse(fs.readFileSync(dbDirectory + '/' + dir + '/' + file, 'utf8'));
                db[dir][id] = object;
                count++;
            }
            catch (e) {
                console.log('cannot read', file, e);
            }
        });
    });
    console.log('read', count, dir + 's');
}

function openDatabase() {
    db = {};
    console.log('reading database from directory', dbDirectory);
    fs.readdirSync(dbDirectory).forEach(function (dir) {
        switch (dir) {
        case '.':
        case '..':
        case 'blob':
            break;
        default:
            readObjects(dir);
        }
    });
}

openDatabase();

var allObjects = [];
function registerId(id) {
    if (allObjects[id]) {
        throw new Error("Duplicate object ID " + id);
    }
    allObjects[id] = true;
}

function Event () {}
function Person () {}
function Piece () {}
function Image () {}

for (var id in db.event) {
    db.event[id].__proto__ = new Event;
    delete db.event[id].type;
    delete db.event[id].image;
}
for (var id in db.person) {
    db.person[id].__proto__ = new Person;
    delete db.person[id].type;
}
for (var id in db.piece) {
    db.piece[id].__proto__ = new Piece;
    delete db.piece[id].type;
}

function processImage(image, callback, done) {
    console.log('process', image);
    image.__proto__ = Image.prototype;
    fs.writeFileSync('images/' + image.filename, fs.readFileSync('../data/blob/' + image.id));
    delete image.type;
    image.name = image.filename;
    delete image.filename;
    var thumbnailFilename = 'thumbnails/' + image.name;
    fs.writeFileSync(thumbnailFilename, fs.readFileSync('../data/blob/' + image.id));
    var thumbnail = gm(thumbnailFilename).size(function (err, size) {
        if (err) throw err;
        image.width = size.width;
        image.height = size.height;
        if (image.width > image.height) {
            image.thumbnailWidth = 100;
            image.thumbnailHeight = Math.floor(image.height / (image.width / 100));
        } else {
            image.thumbnailHeight = 100;
            image.thumbnailWidth = Math.floor(image.width / (image.height / 100));
        }
        thumbnail
            .resize(image.thumbnailWidth, image.thumbnailHeight)
            .write(thumbnailFilename, function (err) {
                if (err) throw err;
                callback(done);
            });
    });
}

var images = [];
for (var i in db.image) {
    images.push(db.image[i]);
}

console.log('loaded db,', images.length, 'images');

function nextImage(done) {
    console.log('process', images.length);
    if (images.length) {
        var image = images[0];
        images.shift();
        processImage(image, nextImage, done);
    } else {
        done();
    }
}

function finalize () {
    for (var id in db.event) {
        var event = db.event[id];
        for (var i in event.people) {
            var peopleRoles = event.people[i];
            for (var j = 1; j < peopleRoles.length; j++) {
                peopleRoles[j] = db.person[peopleRoles[j]];
            }
        }
        if (event.images) {
            event.images = event.images.map(function(id) {
                return db.image[id];
            });
        }
    }

    var events = [];

    for (var id in db.event) {
        events.push(db.event[id]);
    }

    var data = dirty(path.resolve('ballhaus.dat'));
    data.on('load', function () {
        data.set('data', icebox.freeze(events));
    });
}

Step(function () { nextImage(this); },
     function (err) {
         if (err) throw err;
         finalize();
     });
