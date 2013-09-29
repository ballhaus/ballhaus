var Step = require('step');
var fs = require('fs');
var httpGet = require('http-get');
var icebox = require('icebox');
var gm = require('gm');

function Event () {}
function Person (options) {
    for (var key in options) {
        this[key] = options[key];
    }
}
function Piece () {}
function ArchivedPiece () {}
function Enactment () {}
function Page () {}
function Image (options) {
    for (var key in options) {
        this[key] = options[key];
    }
    this.thawed();
}
function Homepage () {}
Image.nameMap = {};
Image.prototype.thawed = function () {
    Image.nameMap[this.name] = this;
}
Image.prototype.makeThumbnail = function (callback) {
    if (this.width > this.height) {
        this.thumbnailWidth = 176;
        this.thumbnailHeight = Math.floor(this.height / (this.width / this.thumbnailWidth));
    } else {
        this.thumbnailHeight = 112;
        this.thumbnailWidth = Math.floor(this.width / (this.height / this.thumbnailHeight));
    }
    gm('images/' + this.name)
        .resize(this.thumbnailWidth, this.thumbnailHeight)
        .write('thumbnails/' + this.name, callback);
}

Image.import = function (filename, name, callback) {
    console.log('import', name);
    Step(function () { gm(filename).size(this); },
         function (err, size) {
             if (err) {
                 callback(err);
                 return;
             }
             this.size = size;
             fs.rename(filename, 'images/' + name, this);
         },
         function (err) {
             if (err) {
                 callback(err);
                 return;
             }
             var image = new Image({ name: name,
                                     width: this.size.width,
                                     height: this.size.height
                                   });
             image.makeThumbnail(function (err) {
                 if (err) throw err;
                 callback(null, image);
             });
         });
}

Image.importFromWeb = function (url, filename, callback) {
    console.log('importFromWeb', url);
    Step(
        function () {
            httpGet.get(url, filename, this);
        },
        function (err) {
            if (err) {
                callback(err);
                return;
            }
            Image.import(filename, filename, this);
        },
        callback);
}

function Video() {}

function thaw(data)
{
    return icebox.thaw(data, [ Event, Person, Piece, ArchivedPiece, Image, Enactment, Video, Page, Homepage ]);
}

module.exports = thaw;
module.exports.Image = Image;
module.exports.Person = Person;
