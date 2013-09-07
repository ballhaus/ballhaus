var dB;

app.factory('db',
            ['$resource', '$http',
             function ($resource, $http) {
                 var db = { objects: [] };

                 var cmsMode = window.location.href.match(/cms/);
                 console.log('cmsMode: ' + cmsMode);

                 dB = db;                                // for debugging
                 
                 db.version = '(unknown)';
                 $resource('/version').get(function (version) {
                     db.version
                         = version.lastCommit.id.substr(0, 6)
                         + ' vom ' + moment.utc(version.lastCommit.committed_date).format('Do MMMM YYYY, hh:mm:ss');
                     if (version.status && !version.status.clean) {
                         version += ' (geändert)';
                     }
                 });

                 db.nextId = function () {
                     var nextId = (db.Extent.lastId || 0) + 1;
                     while (db.Extent.extent[nextId]) {
                         nextId++;
                     }
                     return nextId;
                 }

                 db.Extent = function Extent (attributes) {
                     for (var key in attributes) {
                         this[key] = attributes[key];
                     }
                     if (!('id' in this)) {
                         this.id = db.nextId();
                     }
                     this.thawed();
                 }
                 db.Extent.extent = {};
                 db.Extent.prototype.thawed = function () {
                     var object = this;
                     if (!object.id || db.Extent.extent[object.id]) {
                         var newId = db.nextId();
                         console.log('object id ' + object.id + ' from thawed object unavailable, assigning new id ' + newId);
                         object.id = newId;
                     }
                     db.Extent.extent[object.id] = object;
                     db.Extent.lastId = Math.max(db.Extent.lastId || 0, object.id);
                     if (!object.constructor.extent) {
                         object.constructor.extent = {};
                     }
                     object.constructor.extent[object.id] = object;
                     db.objects.unshift(object);
                 }
                 db.get = function (constructor, id) {
                     var constructorName = constructor.name || ieConstructorName(constructor)
                     console.log('db.get ' + constructorName + ' ' + id);
                     if (db.Extent.extent[id]) {
                         return db.Extent.extent[id];
                     } else {
                         for (var i in db.Extent.extent) {
                             var object = db.Extent.extent[i];
                             if (object.link
                                 && object.link == id
                                 && object.constructor == constructor) {
                                 return object;
                             }
                         }
                     }
                     console.log('not found');
                     return null;
                 }
                 db.findObjects = function (constructor) {
                     var retval = [];
                     for (var id in db.Extent.extent) {
                         var object = db.Extent.extent[id];
                         if (object.constructor == constructor) {
                             retval.push(object);
                         }
                     }
                     return retval;
                 }

                 db.deleteObject = function(convict) {
                     var seenObjects = [];
                     function seen(object) {
                         return seenObjects.indexOf(object) != -1;
                     }
                     function maybeChase(object) {
                         if ((typeof object == 'object') && !seen(object)) {
                             deleteFrom(object);
                         }
                     }
                     function deleteFrom(parent) {
                         seenObjects.push(parent);
                         if (length in parent) {
                             var i = parent.length;
                             while (i--) {
                                 if (parent[i] === convict) {
                                     parent.splice(i, 1);
                                 } else {
                                     maybeChase(parent[i]);
                                 }
                             }
                         } else {
                             for (var key in parent) {
                                 if (parent[key] === convict) {
                                     delete parent[key];
                                 } else {
                                     maybeChase(parent[key]);
                                 }
                             }
                         }
                     }
                     // Fixme: All roots must all be traversed.  Maybe a list of roots should be kept?
                     deleteFrom(db.Extent.extent);
                     deleteFrom(convict.constructor.extent);
                     deleteFrom(db.objects);
                     db.maybeSaveChanges();
                 }

                 // //////////////////////////////////////////////////////////////////////
                 // Event

                 db.Event = function Event (attributes) {
                     this.images = [];
                     this.tags = [];
                     db.Extent.call(this, attributes);
                 }
                 inherits(db.Event, db.Extent);

                 Event.prototype.title = function () {
                     return this.name;
                 }

                 // //////////////////////////////////////////////////////////////////////
                 // Enactment

                 db.Enactment = function Enactment (attributes) {
                     db.Extent.call(this, attributes);
                 }
                 inherits(db.Enactment, db.Extent);

                 db.Enactment.prototype.title = function () {
                     return this.name || this.piece.name;
                 }

                 // //////////////////////////////////////////////////////////////////////
                 // Person

                 db.Person = function Person (attributes) {
                     db.Extent.call(this, attributes);
                 }
                 inherits(db.Person, db.Extent);

                 db.Person.getByName = function (name) {
                     var all = db.findObjects(db.Person);
                     for (var i in all) {
                         var person = all[i];
                         if (utils.urlify(person.name) == utils.urlify(name)) {
                             return person;
                         }
                     }
                     return null;
                 }

                 db.Person.getByLink = function (link) {
                     var all = db.findObjects(db.Person);
                     for (var i in all) {
                         var person = all[i];
                         if (person.link == link) {
                             return person;
                         }
                     }
                     return null;
                 }


                 // //////////////////////////////////////////////////////////////////////
                 // Piece

                 db.Piece = function Piece (attributes) {
                     this.enactments = [];
                     this.tags = [];
                     db.Extent.call(this, attributes);
                 }
                 inherits(db.Piece, db.Extent);

                 // //////////////////////////////////////////////////////////////////////
                 // Page

                 db.Page = function Page (attributes) {
                     db.Extent.call(this, attributes);
                     this.tags = [];
                 }
                 inherits(db.Page, db.Extent);

                 // //////////////////////////////////////////////////////////////////////
                 // Image

                 db.Image = function Image (attributes) {
                     db.Extent.call(this, attributes);
                 }
                 inherits(db.Image, db.Extent);

                 // //////////////////////////////////////////////////////////////////////
                 // Video

                 db.Video = function Video (attributes) {
                     db.Extent.call(this, attributes);
                 }
                 inherits(db.Video, db.Extent);

                 // //////////////////////////////////////////////////////////////////////
                 // Flickr Sets
                 db.flickrSets = $resource('/flickr-sets').query();

                 if (cmsMode) {
                     db.videos = $resource('/video').query(function (videos) {
                         videos.map(function (video) {
                             video.name = video.title;
                             video.vimeoId = video.id;
                             delete video.id;
                         });
                     });
                     db.videos.find = function (id) {
                         for (var i in db.videos) {
                             var video = db.videos[i];
                             if (video.id == id) {
                                 return video;
                             }
                         };
                     }

                     db.tickets = $resource('/tickets').query(function (tickets) {
                         var ticketGroups = {};
                         db.ticketGroups = [];
                         tickets.forEach(function (ticket) {
                             name = ticket.references.eventgroup[0].name;
                             if (!ticketGroups[name]) {
                                 ticketGroups[name] = true;
                                 db.ticketGroups.push(name);
                             }
                         });
                         
                     });
                     var oldState;
                     db.maybeSaveChanges = function () {
                         if (db.editMode) {
                             var newState = JSON.stringify(freeze(db.objects));
                             if (oldState && oldState != newState) {
                                 console.log('saving to localStorage');
                                 localStorage['data'] = newState;
                             }
                             oldState = newState;
                         }
                     }
                     setInterval(db.maybeSaveChanges, 1000);

                     db.pushToServer = function (callback) {
                         console.log('saving to server');
                         $http.post('/db', JSON.stringify(freeze(db.objects)))
                             .success(function () {
                                 delete localStorage['data'];
                                 console.log('done saving');
                                 if (callback) {
                                     callback();
                                 }
                             });

                     }
                 }

                 function reload (data) {
                     oldState = data;
                     thaw(data, [ db.Event, db.Person, db.Piece, db.Image, db.Enactment, db.Page, db.Video ]);

                     db.events = function () {
                         return db.findObjects(db.Event).concat(db.findObjects(db.Enactment));
                     }
                     db.people = db.findObjects.bind(this, db.Person);
                     db.pieces = db.findObjects.bind(this, db.Piece);
                     db.images = db.findObjects.bind(this, db.Image);
                     db.pages = db.findObjects.bind(this, db.Page);
                     db.tags = function () { return [ { name: 'Theater' },
                                                      { name: 'Tanz' },
                                                      { name: 'Film' },
                                                      { name: 'Musik' },
                                                      { name: 'Literatur' },
                                                      { name: 'Ausstellung' },
                                                      { name: 'Denken' },
                                                      { name: 'Performance' },
                                                      { name: 'akademie der autodidakten' },
                                                      { name: 'project in/out' },
                                                      { name: 'Festival Black Lux' }
                                                    ] };
                     db.loaded = true;
                 }
                 if (localStorage.data) {
                     console.log('loading from localStorage');
                     reload(JSON.parse(localStorage.data));
                     $http.get('/db').success(function (serverState) {
                         oldState = serverState;
                     });
                 } else {
                     console.log('loading from server');
                     $resource('/db').query(reload);
                 }

                 return db;
             }]);
