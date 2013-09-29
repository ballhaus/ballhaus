'use strict';

jQuery(function($){
        $.datepicker.regional['de'] = {clearText: 'löschen', clearStatus: 'aktuelles Datum löschen',
                closeText: 'schließen', closeStatus: 'ohne Änderungen schließen',
                prevText: '<zurück', prevStatus: 'letzten Monat zeigen',
                nextText: 'Vor>', nextStatus: 'nächsten Monat zeigen',
                currentText: 'heute', currentStatus: '',
                monthNames: ['Januar','Februar','März','April','Mai','Juni',
                'Juli','August','September','Oktober','November','Dezember'],
                monthNamesShort: ['Jan','Feb','Mär','Apr','Mai','Jun',
                'Jul','Aug','Sep','Okt','Nov','Dez'],
                monthStatus: 'anderen Monat anzeigen', yearStatus: 'anderes Jahr anzeigen',
                weekHeader: 'Wo', weekStatus: 'Woche des Monats',
                dayNames: ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'],
                dayNamesShort: ['So','Mo','Di','Mi','Do','Fr','Sa'],
                dayNamesMin: ['So','Mo','Di','Mi','Do','Fr','Sa'],
                dayStatus: 'Setze DD als ersten Wochentag', dateStatus: 'Wähle D, M d',
                dateFormat: 'dd.mm.yy', firstDay: 1, 
                initStatus: 'Wähle ein Datum', isRTL: false};
        $.datepicker.setDefaults($.datepicker.regional['de']);
});

// Some cheap configuration mechanism

var config = localStorage.config ? JSON.parse(localStorage.config) : { editor: 'tinymce' };

function getConfig(key) {
    return config[key];
}

function setConfig(key, value) {
    config[key] = value;
    localStorage.config = JSON.stringify(config);
}

// Declare app level module which depends on filters, and services
var app = angular.module('cmsApp', ['ui',
                                    'ui.bootstrap',
                                    '$strap.directives',
                                    'ngResource',
                                    'cmsApp.filters',
                                    'cmsApp.directives']);

app.config(['$locationProvider', '$routeProvider', function($locationProvider, $routeProvider) {

    $locationProvider.html5Mode(true);

    [ [ 'home' ],
      [ 'events' ],
      [ 'event/:eventId', EditEventController ],
      [ 'pieces' ],
      [ 'piece/:pieceId', EditPieceController ],
      [ 'enactment/:enactmentId', EditEnactmentController ],
      [ 'people' ],
      [ 'homepage', EditHomepageController ],
      [ 'pages' ],
      [ 'page/:pageName', EditPageController ],
      [ 'person/:personId', EditPersonController ],
      [ 'videos' ],
      [ 'db', EditDatabaseController ],
      [ 'tickets' ],
      [ 'flickr-sets' ],
      [ 'video/:videoId', VideoController ],
    ].forEach(function (pageDef) {
        var def = { name: pageDef[0], templateUrl: '/partials/cms/' + pageDef[0].replace(/\/.*$/, "") + '.html' };
        if (pageDef[1]) {
            def.controller = pageDef[1];
        }
        $routeProvider.when('/cms/' + pageDef[0], def);
    });

    $routeProvider
        .otherwise({ redirectTo: '/cms/home' });
}]);

app.value('ui.config', {
    tinymce: {
        theme: 'advanced',
        theme_advanced_buttons1: "removeformat,|,bold,italic,|,h2,|,link,unlink,image",
        theme_advanced_statusbar_location: "none",
        content_css: "/css/tinymce_content.css",
        plugins: "paste,inlinepopups,heading",
        paste_text_sticky: true,
        entity_encoding: 'raw',
    },
    codemirror: {
        lineWrapping: true
    },
    date: {
        dateFormat: 'DD, d. MM yy'
    }
});

function CmsController($scope, $rootScope, $dialog, $http, $location, db) {

    $scope.discardChanges = function () {
        $dialog
            .messageBox('Daten werden geladen', 'Die Daten werden vom Server neu geladen',
                        [])
            .open();
        db.restoreFromServer(function () {
            window.location = window.location;
        });
    }

    $scope.$on('$routeChangeStart', function (e) {
        console.log('$routeChangeStart');
        db.maybeSaveChanges();
        if (db.hasChanged()) {
            confirm($dialog, "Änderungen online stellen?", "Sollen die Änderungen übernommen werden?",
                    function () {
                        db.pushToServer();
                    },
                    $scope.discardChanges);
        }
    });

    $scope.saveChanges = function () {
        db.pushToServer();
    }

    $scope.hasChanged = function () {
        return db.hasChanged();
    }

    $scope.uploadFile = function(files) {
        var formData = new FormData();
        // Take the first selected file
        formData.append("file", files[0]);

        $http.post('/import-legacy-artists', formData, {
            withCredentials: true,
            headers: {'Content-Type': undefined },
            transformRequest: angular.identity
        })
            .success(function (data) {
                console.log('success', data);
                data.forEach(function (personData) {
                    personData.images = [new db.Image(personData.image)];
                    personData.link = utils.urlify(personData.name);
                    delete personData['image'];
                    new db.Person(personData);
                });
            })
            .error(function (error) {
                console.log('error', error);
            });

    }

    function pollLoginStatus() {
        $http
            .get('/login-status')
            .success(function (loginStatus) {
                if (loginStatus.uuid) {
                    if (loginStatus.uuid == localStorage.lockId) {
                        db.editMode = true;
                        $rootScope.superuser = loginStatus.superuser;
                        $rootScope.state = 'loggedIn';
                    } else {
                        $rootScope.state = 'locked';
                        db.editMode = false;
                        $rootScope.loggedInUser = loginStatus.name;
                    }
                } else {
                    $rootScope.state = 'loggedOut';
                    db.editMode = false;
                }
                db.maybeSaveChanges();
                setTimeout(pollLoginStatus, 1000);
            });
    }
    
    if (!CmsController.initialized) {
        CmsController.initialized = true;

        pollLoginStatus();
    }

    $scope.db = db;
    $scope.newPiece = function () {
        $dialog
            .dialog({ controller: 'NewNamedObjectController',
                      resolve: { defaults: function () { return { } } },
                      templateUrl: '/dialogs/new-piece.html' })
            .open()
            .then(function(name) {
                if (name) {
                    var link = utils.urlify(name);
                    new db.Piece({ name: name,
                                   link: link });
                    db.pushToServer(function () {
                        $location.path('/cms/piece/' + link);
                    });
                }
            });
    }
    $scope.newEvent = function () {
        $dialog
            .dialog({ controller: 'NewNamedObjectController',
                      resolve: { defaults: function () { return { datetime: moment().startOf('day').hour(20).toDate() } } },
                      templateUrl: '/dialogs/new-event.html' })
            .open()
            .then(function (data) {
                if (data) {
                    console.log('new event, data', data);
                    var link = utils.urlify(data.name + ' ' + moment(data.datetime).format("DD.MM.YYYY"));
                    new db.Event({ name: data.name,
                                   link: link,
                                   date: data.datetime });
                    db.pushToServer(function () {
                        $location.path('/cms/event/' + link);
                    });
                }
            });
    }
    $scope.newEnactment = function (piece) {
        $dialog
            .dialog({ controller: 'NewNamedObjectController',
                      resolve: { defaults: function () { return { datetime: moment().startOf('day').hour(20).toDate() } } },
                      templateUrl: '/dialogs/new-enactment.html' })
            .open()
            .then(function (data) {
                if (data) {
                    console.log('data', data);
                    var enactment = new db.Enactment({ date: data.datetime,
                                                       piece: piece });
                    piece.enactments.push(enactment);
                    db.pushToServer(function () {
                        $location.path('/cms/enactment/' + enactment.id);
                    });
                }
            });
    }

    $rootScope.state = 'loggedOut';

    $rootScope.menuDisplay = function () {
        if (this.state == 'loggedIn') {
            return "inherit";
        } else {
            return "hidden";
        }
    }

    $scope.superuserDisplay = function () {
        return $rootScope.superuser ? "block" : "none";
    }
}
CmsController.$inject = ['$scope', '$rootScope', '$dialog', '$http', '$location', 'db'];

function LoginController($scope, $rootScope, $dialog, $http, $location, db) {
    $scope.loginFailure = 'none';

    $scope.displayState = function(state) {
        if ($rootScope.state == state) {
            return "block";
        } else {
            return "none";
        }
    }

    $scope.clearLoginFailure = function () {
        $scope.loginFailure = 'none';
    }

    $scope.login = function () {
        $scope.clearLoginFailure();
        $http
            .get('/user-salt/' + $scope.name)
            .success(function (muffineer) {
                $http
                    .post('/login', { name: $scope.name,
                                      password: sha1(sha1($scope.password + muffineer.userSalt) + muffineer.sessionSalt) })
                    .success(function (loginStatus) {
                        $rootScope.state = 'loggedIn';
                        localStorage.lockId = loginStatus.uuid;
                        db.editMode = true;
                        db.load(true, function () {
                            $location.path('/cms/events');
                        });
                    })
                    .error(function (message, status) {
                        if (status == 401) {
                            $scope.loginFailure = 'block';
                        } else {
                            console.log(message, status);
                        }
                    });
            });
    }

    $scope.uploadChanges = true;

    $scope.logout = function (force) {
        localStorage['data'] = '';
        localStorage.lockId = '';
        $http.post(force ? '/logout?force=1' : '/logout')
            .success(function () {
                window.location = '/cms';
            });
    }
}
LoginController.$inject = ['$scope', '$rootScope', '$dialog', '$http', '$location', 'db'];

function EventsController($scope) {
    $scope.archived = (location.hash == '#archiv');
    $scope.archiv = function () {
        location.hash = 'archiv';
    }
    $scope.current = function () {
        location.hash = '';
    }
}
EventsController.$inject = ['$scope'];

function confirm($dialog, title, message, okCallback, cancelCallback) {
    $dialog
        .messageBox(title, message,
                    [ { result: 'cancel', label: 'Nein', cssClass: 'btn-danger' },
                      { result: 'ok', label: 'Ja' } ])
        .open()
        .then(function (result) {
            if (result == 'ok') {
                okCallback && okCallback();
            } else {
                cancelCallback && cancelCallback();
            }
        });
}

function EditEventController($scope, $dialog, $routeParams, db) {
    console.log('get event', $routeParams.eventId);
    $scope.event = db.get(db.Event, $routeParams.eventId);

    $scope.deleteEvent = function () {
        confirm($dialog, 'Veranstaltung löschen', 'Die Veranstaltung wirklich löschen?',
                function () {
                    db.deleteObject($scope.event);
                    window.history.back();
                });
    }
}
EditEventController.$inject = ['$scope', '$dialog', '$routeParams', 'db'];

function EditPieceController($scope, $dialog, $routeParams, db) {
    $scope.piece = db.get(db.Piece, $routeParams.pieceId);
    $scope.deletePiece = function () {
        confirm($dialog, 'Stück löschen', 'Das Stück "' + $scope.piece.name + '" und alle Aufführungen wirklich löschen?',
                function () {
                    console.log('delete piece', $scope.piece.name);
                    var enactments = db.findObjects(db.Enactment);
                    for (var i in enactments) {
                        if (enactments[i].piece == $scope.piece) {
                            db.deleteObject(enactments[i]);
                        }
                    }
                    db.deleteObject($scope.piece);
                    window.history.back();
                });
    }
}
EditPieceController.$inject = ['$scope', '$dialog', '$routeParams', 'db'];

function EditEnactmentController($scope, $dialog, $routeParams, db) {
    $scope.enactment = db.get(db.Enactment, $routeParams.enactmentId);
    $scope.deleteEnactment = function () {
        confirm($dialog, 'Aufführung löschen', 'Die Aufführung wirklich löschen?',
                function () {
                    db.deleteObject($scope.enactment);
                    window.history.back();
                });
    }
}
EditPieceController.$inject = ['$scope', '$dialog', '$routeParams', 'db'];

function EditPersonController($scope, $dialog, $routeParams, db) {
    console.log('EditPersonController', $routeParams.personId);
    $scope.person = db.get(db.Person, $routeParams.personId);
    console.log('person', $scope.person);
    $scope.deletePerson = function () {
        confirm($dialog, 'Personeneintrag löschen', 'Den Personeneintrag wirklich löschen?',
                function () {
                    db.deleteObject($scope.person);
                    window.history.back();
                });
    }
}
EditPersonController.$inject = ['$scope', '$dialog', '$routeParams', 'db'];

function EditDatabaseController($scope, $dialog, db) {
    $scope.editorOptions = {
        lineWrapping : true,
        lineNumbers: true,
        mode: 'javascript',
        json: true
    };
    $scope.database = JSON.stringify(JSON.parse(localStorage.data), null, 2);
    console.log('loaded', db.objects.length, 'objects');
    $scope.saveChanges = function () {
        try {
            var data = JSON.parse($scope.database);
            console.log('saving', data.length, 'objects');
            localStorage.data = JSON.stringify(data);
            location = '/cms';
        }
        catch (e) {
            $dialog
                .messageBox('Fehler beim Abspeichern',
                            'Datenbank konnte nicht gespeichert werden: ' + e,
                            [ { label: 'OK' } ])
                .open();
        }
    }
}
EditDatabaseController.$inject = ['$scope', '$dialog', 'db'];

function EditHomepageController($scope, db) {
    $scope.pages = db.pages().filter(function (page) { return !page.linkedFromMenu; });
    $scope.pieces = db.pieces();
    $scope.homepage = db.homepage;
}
EditHomepageController.$inject = ['$scope', 'db'];

function EditPageController($scope, $dialog, $routeParams, db) {
    var pageName = $routeParams.pageName;
    console.log('EditPageController', pageName);
    $scope.page = db.get(db.Page, pageName) || new db.Page({ name: pageName, link: pageName });
    console.log('page', $scope.page);

    $scope.deletePage = function () {
        confirm($dialog, 'Seite löschen', 'Die Seite wirklich löschen?',
                function () {
                    db.deleteObject($scope.page);
                    window.history.back();
                });
    }
}
EditPageController.$inject = ['$scope', '$dialog', '$routeParams', 'db'];

function EditParticipantsController($scope, dialog, model) {
    console.log('EditParticipantsController, model', model);
    $scope.model = model;
    $scope.close = dialog.close.bind(dialog);
}
EditParticipantsController.$inject = ['$scope', 'dialog', 'model'];

function VideoController($scope, $routeParams, db) {
    db.videos.forEach(function (video) {
        if (video.id == $routeParams.videoId) {
            $scope.video = video;
        }
    });
}
VideoController.$inject = ['$scope', '$routeParams', 'db'];

function SelectVideoController($scope, dialog, db) {
    $scope.close = dialog.close.bind(dialog)
    $scope.videos = db.videos;
}
SelectVideoController.$inject = ['$scope', 'dialog', 'db'];

function SelectFlickrSetController($scope, dialog, db) {
    $scope.close = dialog.close.bind(dialog)
    $scope.flickrSets = db.flickrSets;
}
SelectFlickrSetController.$inject = ['$scope', 'dialog', 'db'];

function NewNamedObjectController($scope, dialog, defaults) {
    $scope.data = defaults || {};
    $scope.close = dialog.close.bind(dialog)
}
NewNamedObjectController.$inject  = ['$scope', 'dialog', 'defaults'];

function ConfigurationController($scope) {
    $scope.editor = getConfig('editor');
    $scope.changeEditor = function (editor) {
        setConfig('editor', editor);
    }
}

angular.module('cmsApp.filters', []).
    filter('interpolate', ['version', function(version) {
        return function(text) {
            return String(text).replace(/\%VERSION\%/mg, version);
        }
    }])
    .filter('emptyPerson', function () {
        return function (persons) {
            return persons.filter(function (person) {
                return person.bio || person.images;
            });
        }
    })
    .filter('eventDate', function () {
        return function (events, historic) {
            var now = new Date();
            return events.filter(function (event) {
                var isHistoric = (new Date(event.date)).getTime() < now.getTime();
                return historic ? isHistoric : !isHistoric;
            });
        }
    });

angular.module('cmsApp.directives', [])
    .directive("ref", [ '$compile', 'db', function ($compile, db) {
        return {
            restrict: 'E',
            replace: true,
            link: function ($scope, element, attributes) {
                $scope.object = $scope.$eval(attributes.object);
                $scope.type = attributes.type || $scope.object.constructor.name.toLowerCase();
                if (attributes.title) {
                    $scope.title = $scope.$eval(attributes.title);
                } else {
                    $scope.title
                        = $scope.object.title
                        ? ((typeof $scope.object.title == 'function')
                           ? $scope.object.title()
                           : $scope.object.title)
                    : $scope.object.name;
                }
                $scope.link = $scope.object.link || $scope.object.id;
                var contents = angular.element('<a href="/cms/{{type}}/{{link}}">{{title}}</div>');
                element.replaceWith(contents);
                $compile(contents)($scope);
            }
        };
    }])
    .directive("menuLink", function () {
        return {
            restrict: 'E',
            replace: true,
            transclude: true,
            scope: true,
            template: '<li ng-class="active()"><a href="/cms/{{to}}" ng-transclude></a></li>',
            link: function ($scope, element, attributes) {
                $scope.directoryMatch = new RegExp('^(' + attributes.to + '|' + attributes.subs + ')$');
                $scope.active = function () {
                    var urlMatch = window.location.href.match('/cms/([^/]+)');
                    if (urlMatch && $scope.directoryMatch.test(urlMatch[1])) {
                        return "active";
                    } else {
                        return "";
                    }
                }
                $scope.to = attributes.to;
            }
        };
    })
    .directive("optionalText", [ '$compile', function($compile) {
        return {
            restrict: 'E',
            replace: true,
            scope: true,
            link: function ($scope, element, attributes) {
                $scope.$watch(attributes.model, function () {
                    var textValue = $scope.$eval(attributes.model);
                    $scope.rows = attributes.rows || 5;
                    $scope.showControl = function(asTextEditor) {
                        var contents;
                        if (asTextEditor) {
                            contents = angular.element('<textarea ui-' + config.editor + ' ng-model="' + attributes.model
                                                       + '" rows="' + $scope.rows + '" class="fancy-editor">');
                            $scope.mode = 'editor';
                        } else {
                            contents = angular.element('<button ng-click="showControl(true)">+</button>');
                            $scope.mode = 'button';
                        }
                        element.children().remove();
                        element.append(contents);
                        $compile(contents)($scope);
                    }
                    if (!$scope.mode
                        || (($scope.mode == 'button') && (textValue != ''))
                        || (($scope.mode == 'editor') && (textValue == ''))) {
                        $scope.showControl(textValue);
                    }
                });
            }
        };
    }])
    .directive("videoSelector", [ '$compile', '$dialog', 'db', function($compile, $dialog, db) {
        return {
            restrict: 'E',
            replace: true,
            scope: { model: '=model' },
            link: function ($scope, element, attributes) {
                function redraw() {
                    var video = $scope.model;
                    var contents;
                    element.children().remove();
                    var html = "<div>";
                    if (video) {
                        $scope.video = video;
                        html += '<img ng-src="{{video.thumbnail_small}}"/> <ref object="video"/><p/>';
                    }
                    html += '<button class="btn btn-small btn-primary" ng-click="selectVideo()">Video auswählen</button>';
                    if (video) {
                        html += ' <button class="btn btn-small btn-danger" ng-click="clearVideo()">Video entfernen</button>';
                    }
                    html += '</div>';
                    contents = angular.element(html);
                    element.append(contents);
                    $compile(contents)($scope);
                }

                $scope.selectVideo = function () {
                    $dialog
                        .dialog()
                        .open('/dialogs/select-video.html', 'SelectVideoController')
                        .then(function(video) {
                            $scope.model = new db.Video(video);
                        });
                }

                $scope.clearVideo = function () {
                    $scope.model = undefined;
                }

                $scope.$watch('model', redraw);
            }
        };
    }])
    .directive("flickrSetSelector", [ '$compile', '$dialog', '$resource', 'db', function($compile, $dialog, $resource, db) {
        return {
            restrict: 'E',
            replace: true,
            scope: { set: '=set', images: '=images' },
            link: function ($scope, element, attributes) {
                function redraw() {
                    var flickrSet = $scope.set;
                    element.children().remove();
                    var html = "<div>";
                    if (flickrSet) {
                        $scope.flickrSet = flickrSet;
                        html += '<a ng-href="http://www.flickr.com/photos/ballhausnaunynstrasse-presse/sets/{{flickrSet.id}}/" target="_new">{{flickrSet.title._content}}</a><br/>';
                    }
                    html += '<button class="btn btn-small btn-primary" ng-click="selectFlickrSet()">Flickr Set auswählen</button>';
                    if (flickrSet) {
                        html += ' <button class="btn btn-small btn-primary" ng-click="downloadFlickrSet()">Bilder übernehmen</button>';
                        html += ' <button class="btn btn-small btn-danger" ng-click="clearFlickrSet()">Entfernen</button>';
                    }
                    html += '</div>';
                    var contents = angular.element(html);
                    element.append(contents);
                    $compile(contents)($scope);
                }

                $scope.selectFlickrSet = function () {
                    $dialog
                        .dialog()
                        .open('/dialogs/select-flickr-set.html', 'SelectFlickrSetController')
                        .then(function(flickrSet) {
                            if (flickrSet) {
                                $scope.set = { id: flickrSet.id,
                                               title: flickrSet.title };
                            }
                        });
                }

                $scope.clearFlickrSet = function () {
                    $scope.set = undefined;
                }

                $scope.downloadFlickrSet = function () {
                    console.log('download flickr set', $scope.set.id, 'images', $scope.images);
                    $resource('/download-flickr-set/' + $scope.set.id)
                        .query(function (images) {
                            images = thaw(images, [ db.Image ]);
                            console.log('got images', images);
                            $scope.images = images;
                        });
                }

                $scope.$watch('set', redraw);
            }
        };
    }])
    .directive("imageUploader", [ 'db', function(db) {
        return {
            restrict: 'E',
            replace: true,
            scope: { model: '=model' },
            link: function($scope, element, attributes) {
                new qq.FineUploader({
                    element: element[0],
                    request: {
                        endpoint: '/image'
                    },
                    validation: {
                        allowedExtensions: ['jpeg', 'jpg', 'gif', 'png']
                    },
                    callbacks: { 
                        onComplete: function(id, fileName, response) {
                            console.log('upload complete', id, 'fileName', fileName, 'response', JSON.stringify(response));
                            if (response.success) {
                                if (!$scope.model) {
                                    $scope.model = [];
                                }
                                $scope.model.push(new db.Image(response.image));
                                $scope.$apply();
                            }
                        }
                    }
                });
            }
        }
    }])
    .directive("pdfUploader", [ 'db', function(db) {
        return {
            restrict: 'E',
            replace: true,
            scope: { model: '=model' },
            templateUrl: '/partials/cms/pdf-uploader.html',
            link: function($scope, element, attributes) {
                $scope.modelSetStyle = function () {
                    if ($scope.model) {
                        return "display: block";
                    } else {
                        return "display: none";
                    }
                }

                $scope.deletePdf = function () {
                    $scope.model = undefined;
                }

                new qq.FineUploader({
                    element: $(element).find('#uploader')[0],
                    request: {
                        endpoint: '/pdf'
                    },
                    validation: {
                        allowedExtensions: ['pdf']
                    },
                    callbacks: { 
                        onComplete: function(id, fileName, response) {
                            console.log('upload complete', id, 'fileName', fileName, 'response', JSON.stringify(response));
                            if (response.success) {
                                $scope.model = response.pdf;
                                $scope.$apply();
                            }
                        }
                    }
                });
            }
        }
    }])
    .directive("thumbnailImg", [ function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/dialogs/thumbnail-image.html',
            link: function ($scope, element, attributes) {
                var top = Math.floor(($(element).height() / 2) - ($scope.image.thumbnailHeight / 2));
                var left = Math.floor(($(element).width() / 2) - ($scope.image.thumbnailWidth / 2));
                $(element)
                    .on('mouseenter', function () {
                        $(element).find('div.actions').show('fade', {}, 150);
                    })
                    .on('mouseleave', function () {
                        $(element).find('div.actions').hide('fade', {}, 150);
                    })
                    .find('img')
                    .css('top', top + 'px')
                    .css('left', left + 'px');
                $(element).find('div.actions').hide();

            }
        }
    }])
    .directive("imageGallery", [ '$dialog', function ($dialog) {
        return {
            restrict: 'A',
            link: function ($scope, element, attributes) {

                $scope.deleteImage = function () {
                    $scope.images.splice($scope.images.indexOf(this.image), 1);
                }

                $scope.editCredits = function (arg) {
                    var image = this.image;
                    $dialog
                        .dialog({ resolve: { image: function () { return image; } },
                                  controller: function ($scope, dialog, image) {
                                      $scope.image = image;
                                      $scope.close = dialog.close.bind(dialog);
                                  }})
                        .open('/dialogs/edit-image-credits.html');
                }

                $scope.zoom = function (arg) {
                    var image = this.image;;
                    $dialog
                        .dialog({ resolve: { image: function () { return image; } },
                                  controller: function ($scope, dialog, image) {
                                      $scope.image = image;
                                      $scope.close = dialog.close.bind(dialog);
                                  }})
                        .open('/dialogs/zoom-image.html');
                }

                $scope.dragStart = function(e, ui) {
                    ui.item.data('start', ui.item.index());
                }

                $scope.dragEnd = function(e, ui) {
                    var start = ui.item.data('start');
                    var end = ui.item.index();
                    
                    $scope.images.splice(end, 0, $scope.images.splice(start, 1)[0]);
                    $scope.$apply();
                }

                $(element).sortable({
                    start: $scope.dragStart,
                    update: $scope.dragEnd
                });
            }
        }
    }])
    .directive("imageGalleryUploader", function () {
        return {
            restrict: 'E',
            templateUrl: '/dialogs/image-gallery-uploader.html',
            scope: { images: '=images' }
        }
    })
    .directive("priceInputs", function () {
        return {
            restrict: 'E',
            templateUrl: '/partials/cms/price-inputs.html',
            scope: { object: '=model' }
        }
    })
    .directive("ticketLink", ['db', function (db) {
        return {
            restrict: 'E',
            scope: { object: '=model' },
            templateUrl: '/partials/cms/ticket-link.html',
            link: function (scope, element, attrs, controller) {
                scope.date = moment(scope.object.date).format("YYYY-MM-DD");
                scope.time = moment(scope.object.date).format("HH:mm");
                db.tickets.forEach(function (ticket) {
                    if ((ticket.startdate == scope.date) && (ticket.starttime == scope.time)) {
                        scope.object.ticketLink = ticket.affiliateSaleUrl;
                        console.log('ticket gefunden', ticket.affiliateSaleUrl);
                    }
                });
                scope.hasTicketLinkStyle = function (hasLink) {
                    return "display: " + ((hasLink ^ !scope.object.ticketLink) ? "block" : "none");
                }
                if (!scope.object.ticketLink) {
                    console.log('ticket NICHT gefunden');
                } else {
                    scope.ticketLink = scope.object.ticketLink;
                }
            }
        }
    }])
    .directive('dateInput', function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/cms/date-input.html',
            scope: { model: '=model' }
        }
    })
    .directive('timepicker', function () {
        return {
            restrict: 'A',
            require: '?ngModel',
            link: function (scope, element, attrs, controller) {
                controller.$parsers.unshift(function (viewValue) {
                    if (/^(\d|[01]\d|2[0-3]):([0-5]\d)$/.test(viewValue)) {
                        controller.$setValidity('time', true);
                        return viewValue;
                    } else {
                        controller.$setValidity('time', false);
                        return;
                    }
                });
            }
        };
    })
    .directive('dateTimePicker', function () {
        return {
            restrict: 'E',
            scope: true,
            require: '?ngModel',
            templateUrl: '/partials/date-time-picker.html',
            link: function (scope, element, attrs, ngModel) {
                ngModel.$render = function () {
                    if (this.$modelValue) {
                        var m = new moment(this.$modelValue);
                        scope.date = m.format('DD.MM.YYYY');
                        scope.time = m.format('HH:mm');
                    }
                }

                function parse() {
                    if (typeof scope.date != 'string') {
                        scope.date = moment(scope.date).format('DD.MM.YYYY');
                    }
                    if (!moment(scope.date, 'DD.MM.YYYY').isValid()) {
                        console.log('invalid date');
                    } else if (!moment(scope.time, 'HH:mm').isValid()) {
                        console.log('invalid time');
                    } else {
                        var datetime = scope.date + ' ' + scope.time;
                        var m = moment(datetime, 'DD.MM.YYYY HH:mm');
                        ngModel.$setViewValue(m.toDate());
                        ngModel.$setValidity('date', true);
                        ngModel.$setValidity('time', true);
                    }
                }

                element.on('blur keyup change', function () {
                    scope.$apply(parse);
                });
            }
        }
    })
    .directive('participantEditor', ['$dialog', 'db', function ($dialog, db) {
        return {
            restrict: 'E',
            scope: { model: '=model' },
            replace: true,
            templateUrl: '/partials/cms/participants.html',
            link: function ($scope, element, attrs, controller) {

                function peopleMatch(string) {
                    var data = [];
                    var re = /(.*):\s*(.*)/g;
                    var match;
                    while ((match = re.exec(string)) !== null) {
                        data.push({ role: match[1],
                                    people: match[2].split(/\s*,\s*/).map(function (name) {
                                        var person = db.Person.getByName(name);
                                        return { name: name,
                                                 link: (person ? person.link : utils.urlify(name)) };
                                    })});
                    }
                    return data;
                }
                $scope.data = peopleMatch($scope.model);
                $scope.rolePeoples = function () {
                    return $scope.data;
                }
                $scope.ensurePerson = function (person) {
                    console.log('ensurePerson', person);
                    db.Person.getByName(person.name) || new db.Person(person);
                }
                $scope.openEditor = function () {
                    $dialog
                        .dialog({ resolve: { model: function () { return angular.copy($scope.model); } } })
                        .open('/dialogs/edit-participants.html', 'EditParticipantsController')
                        .then(function(model) {
                            if (model) {
                                $scope.model = model;
                                $scope.data = peopleMatch($scope.model);
                            }
                        });
                }
            }
        };
    }])
    .directive('tagSelector', ['db', function (db) {
        return {
            restrict: 'E',
            scope: { model: '=model' },
            templateUrl: '/partials/cms/tag-selector.html',
            link: function ($scope, element, attrs, controller) {
                if (!$scope.model) {
                  $scope.model = [];
                }

                $scope.tagPosition = function (tagName) {
                    return $scope.model.indexOf(tagName);
                }

                $scope.calculateTags = function () {
                    $scope.tags = db.tags().map(function (tag) {
                        var retval = { name: tag.name };
                        if ($scope.tagPosition(tag.name) != -1) {
                            retval['class'] = 'selected';
                        }
                        return retval;
                    });
                };
                $scope.calculateTags();
                function calculateModel() {
                    $scope.model = $scope.tags.filter(function (tag) {
                        return tag['class'];
                    }).map(function (tag) {
                        return tag.name;
                    }).reverse();
                }
                $scope.toggle = function () {
                    var tObject = $scope.tags[this.$index];
                    tObject['class'] = tObject['class'] ? '' : 'selected';

                    calculateModel();
                }
            }
        }
    }])
    .directive('pageDirectory', ['db', '$dialog', '$location', function (db, $dialog, $location) {

        return {
            restrict: 'E',
            link: function ($scope, element, attrs, controller) {
                $scope.newPage = function () {
                    $dialog
                        .dialog({ controller: 'NewNamedObjectController',
                                  resolve: { defaults: function () { return { } } },
                                  templateUrl: '/dialogs/new-page.html' })
                        .open()
                        .then(function (data) {
                            if (data) {
                                console.log('new page, data', data);
                                var link = utils.urlify(data.name);
                                new db.Page({ name: { de: data.name },
                                              link: link });
                                db.pushToServer(function () {
                                    $location.path('/cms/page/' + link);
                                });
                            }
                        });
                }

                var linkedPages = [];
                $('.edit-menu a').each(function (x, node) {
                    linkedPages.push(db.get(db.Page, $(node).attr('page')));
                });
                $scope.freePages = [];
                db.pages().forEach(function (page) {
                    if ($.inArray(page, linkedPages) == -1) {
                        $scope.freePages.push(page);
                    } else {
                        page.linkedFromMenu = true;
                    }
                });
            }
        }
    }])
    .directive("pageEditRef", [ 'db', function (db) {
        return {
            restrict: 'E',
            replace: true,
            scope: true,
            template: '<a href="/cms/page/{{link}}">{{title}}</a>',
            link: function ($scope, element, attributes) {
                var page = db.get(db.Page, attributes.page);
                $scope.link = page ? page.link : "";
                $scope.title = page ? page.name.de : "unknown page " + attributes.link;
            }
        };
    }])
    .directive("previewLink", [ '$compile', function ($compile) {
        return {
            restrict: 'E',
            replace: true,
            link: function ($scope, element, attributes) {
                if (attributes.object) {
                    $scope.object = $scope.$eval(attributes.object);
                    $scope.previewLink = attributes.prefix + $scope.object.link;
                } else {
                    $scope.previewLink = attributes.prefix;
                }
                $scope.realLink = 'http://ballhausnaunynstrasse.de' + $scope.previewLink;
                var contents = angular.element('<a class="preview" target="bhn-preview" href="{{previewLink}}">{{realLink}}</a>');
                element.replaceWith(contents);
                $compile(contents)($scope);
            }
        };
    }]);

