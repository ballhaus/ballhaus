var dB;

app.factory('db',
             function ($resource, $http, $rootScope, $q) {
                 var db = { objects: [] };

                 var deferred = $q.defer();
                 db.promise = deferred.promise;

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
                     Object.defineProperty(object, '$$hashKey', { enumerable: false, writable: true });
                     db.objects.unshift(object);
                 }

                 db.Extent.prototype.cmsLink = function () {
                     return "/cms/" + this.constructor.name.toLowerCase() + "/" + this.id;
                 }

                 db.get = function (constructor, id) {
                     var constructorName = constructor.name || ieConstructorName(constructor)
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
                     console.log('db.get ' + constructorName + ' ' + id + ' not found');
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

                 db.deleteObject = function (convict) {
                     db.deleteObjects([convict]);
                 }

                 db.deleteObjects = function (convicts) {
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
                         if (parent) {
                             seenObjects.push(parent);
                             if (length in parent) {
                                 var i = parent.length;
                                 while (i--) {
                                     if (convicts.indexOf(parent[i]) != -1) {
                                         parent.splice(i, 1);
                                     } else {
                                         maybeChase(parent[i]);
                                     }
                                 }
                             } else {
                                 for (var key in parent) {
                                     if (convicts.indexOf(parent[key]) != -1) {
                                         delete parent[key];
                                     } else {
                                         maybeChase(parent[key]);
                                     }
                                 }
                             }
                         }
                     }
                     // Fixme: All roots must be traversed.  Maybe a list of roots should be kept?
                     deleteFrom(db.Extent.extent);
                     convicts.forEach(function (convict) {
                         deleteFrom(convict.constructor.extent);
                     });
                     deleteFrom(db.objects);
                     db.pushToServer();
                 }

                 db.processParticipants = function () {
                     // The bi-directional association between Persons
                     // and Events/Pieces/ArchivedPieces is maintained
                     // in this function.  Whenever the textual
                     // description of the participants of an
                     // Event/Piece/ArchivedPiece changes, it is
                     // called to update the links.

                     // Remove all previous links to this Event/Piece/ArchivedPiece.
                     var inWhat = this;
                     if (this.rolesPeople) {
                         this.rolesPeople.forEach(function (rolePeople) {
                             console.log('cleaning', rolePeople);
                             rolePeople.people.forEach(function (person) {
                                 if (person.person && person.person.participations) {
                                     person.person.participations = person.person.participations.filter(function (participation) {
                                         return participation.inWhat != inWhat;
                                     });
                                 }
                             });
                         });
                     }

                     // Build new links
                     this.rolesPeople = [];
                     var participants = this.participants;
                     if (participants) {
                         this.rolesPeople = db.peopleMatch(participants);
                         this.rolesPeople.forEach(function (rolePeople) {
                             var role = rolePeople.role;
                             rolePeople.people.forEach(function (person) {
                                 if (person.person) {
                                     if (!person.person.participations) {
                                         person.person.participations = [];
                                     }
                                     person.person.participations.push({ role: role, inWhat: inWhat });
                                 }
                             });
                         });
                     }
                 }

                 // //////////////////////////////////////////////////////////////////////
                 // Event

                 db.Event = function Event (attributes) {
                     this.images = [];
                     this.tags = [];
                     db.Extent.call(this, attributes);
                 };
                 inherits(db.Event, db.Extent);

                 db.Event.prototype.title = function () {
                     return this.name;
                 };

                 db.Event.prototype.isCurrent = function () {
                     return !moment(this.date).isBefore(moment(), 'day');
                 };

                 db.Event.prototype.processParticipants = db.processParticipants;

                 // //////////////////////////////////////////////////////////////////////
                 // Enactment

                 db.Enactment = function Enactment (attributes) {
                     db.Extent.call(this, attributes);
                 }
                 inherits(db.Enactment, db.Event);

                 db.Enactment.prototype.title = function () {
                     return this.name || this.piece.name;
                 }

                 db.Enactment.prototype.isCurrent = function () {
                     return !moment(this.date).isBefore(moment(), 'day');
                 };

                 db.Enactment.prototype.processParticipants = db.processParticipants;

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

                 db.Piece.prototype.title = function () {
                     return this.name;
                 };

                 db.Piece.prototype.processParticipants = db.processParticipants;

                 // //////////////////////////////////////////////////////////////////////
                 // ArchivedPiece

                 db.ArchivedPiece = function ArchivedPiece (attributes) {
                     db.Extent.call(this, attributes);
                 }
                 inherits(db.ArchivedPiece, db.Extent);

                 db.ArchivedPiece.prototype.processParticipants = db.processParticipants;

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
                 // Homepage

                 db.Homepage = function Homepage (attributes) {
                     db.Extent.call(this, attributes);
                 }
                 inherits(db.Homepage, db.Extent);

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

                     db.tickets = $resource('/ticket-data').query(function (tickets) {
                         var ticketGroups = {};
                         db.ticketGroups = [];
                         tickets.forEach(function (ticket) {
                             if (ticket.references) {
                                 name = ticket.references.eventgroup[0].name;
                                 if (!ticketGroups[name]) {
                                     ticketGroups[name] = true;
                                     db.ticketGroups.push(name);
                                 }
                             }
                         });
                         
                     });

                     db.pushToServer = function (callback) {
                         console.log('saving to server');
                         db.serverState = JSON.stringify(freeze(db.objects));
                         $http.post('/db', db.serverState)
                             .success(function () {
                                 if (callback) {
                                     callback();
                                 }
                             })
                             .error(function () {
                                 alert('Daten konnten nicht auf dem Server gespeichert werden!');
                             });
                     }
                 }

                 function archiveEnactments() {
                     // Archivierungslogik: Beim Laden der Datenbank
                     // werden alle vergangenen Aufführungen
                     // archiviert, indem die Beschreibung und die
                     // Besetzungsliste in ein ArchivedPiece-Objekt
                     // überführt und an das Enactment angehängt wird.
                     // Die Archivierung wird nur persistent, wenn die
                     // Datenbank abgespeichert wird.
                     var now = moment();
                     var archivedPieces = {};
                     db
                         .enactments()
                         .filter(function (enactment) {
                             return !enactment.isCurrent() && !enactment.archivedPiece;
                         })
                         .forEach(function (enactment) {
                             console.log('archive', enactment);
                             var piece = enactment.piece;
                             if (!archivedPieces[piece.id]) {
                                 archivedPieces[piece.id] = new db.ArchivedPiece({ participants: piece.participants,
                                                                                   description: { de: piece.description && piece.description.de,
                                                                                                  en: piece.description && piece.description.en }});
                             }
                             enactment.archivedPiece = archivedPieces[piece.id];
                         });
                 }

                 db.peopleMatch = function (string) {
                    var data = [];
                    var re = /(.*):\s*(.*)/g;
                    var match;
                    while ((match = re.exec(string)) !== null) {
                        data.push({ role: match[1],
                                    people: match[2].split(/\s*,\s*/).map(function (name) {
                                        name = name.replace(/^ *(.*?) *$/, "$1");
                                        var retval = { name: name };
                                        var person = db.Person.getByName(name);
                                        if (person) {
                                            retval.person = person;
                                            retval.link = person.link;
                                        } else {
                                            retval.link = utils.urlify(name);
                                        }
                                        return retval;
                                    })});
                    }
                    return data;
                 }

                 function initializeObjects(data) {
                     db.objects = [];
                     db.Extent.lastId = 0;
                     db.Extent.extent = {};
                     thaw(data, [ db.Event, db.Person, db.Piece, db.ArchivedPiece, db.Image, db.Enactment, db.Page, db.Video, db.Homepage ]);

                     db.events = function () {
                         return db.findObjects(db.Event).concat(db.findObjects(db.Enactment));
                     }
                     db.enactments = db.findObjects.bind(this, db.Enactment);
                     db.people = db.findObjects.bind(this, db.Person);
                     db.pieces = db.findObjects.bind(this, db.Piece);
                     db.images = db.findObjects.bind(this, db.Image);
                     db.pages = db.findObjects.bind(this, db.Page);

                     archiveEnactments();

                     // Schema migration for Page title translation
                     db.pages().forEach(function (page) {
                         if (typeof page.name == 'string') {
                             page.name = { de: page.name };
                         }
                     });
                     var homepages = db.findObjects(db.Homepage);
                     if (homepages.length) {
                         db.homepage = homepages[0];
                     } else {
                         db.homepage = new db.Homepage;
                     }
                     db.tags = function () { return [ { name: 'Theater' },
                                                      { name: 'Tanz' },
                                                      { name: 'Performance' },
                                                      { name: 'Film' },
                                                      { name: 'Musik' },
                                                      { name: 'Literatur' },
                                                      { name: 'Ausstellung' },
                                                      { name: 'Denken' },
                                                      { name: 'akademie der autodidakten' },
                                                      { name: 'project in/out' },
                                                      { name: 'Festival Black Lux' }
                                                    ] };
                     db.serverState = JSON.stringify(freeze(db.objects));
                     db.loaded = true;
                     if (!$rootScope.$$phase) {
                         $rootScope.$apply(function () {
                            deferred.resolve(db);
                         });
                     } else {
                         deferred.resolve(db);
                     }
                 }

                 function saveLocalState() {
                     if (db.serverState) {
                         db.localState = JSON.stringify(freeze(db.objects));
                     }
                 }

                 setInterval(saveLocalState, 1000);

                 db.hasChanged = function () {
                     return db.serverState && db.localState && (db.localState != db.serverState);
                 }

                 db.open = function (editMode) {
                     db.editMode = editMode;
                     console.log('loading from server');
                     $http.get('/db').success(function (state) {
                         initializeObjects(state);
                     });
                     db.opened = true;

                     return db.promise;
                 }

                 db.ensure = function () {
                     if (!db.opened) {
                         db.open();
                     }
                     return db.promise;
                 }

                 db.close = function () {
                     db.opened = false;
                 }

                 db.restoreFromServer = function (handler) {
                     db.close();
                     db.open(db.editMode).then(handler);
                 }

                 db.processAllParticipations = function () {
                     db.events().forEach(function (event) { event.processParticipants(); })
                     db.pieces().forEach(function (piece) { piece.processParticipants(); })
                     db.enactments().forEach(function (enactment) { enactment.processParticipants(); })
                     db.pushToServer();
                 }

                 return db;
             });
