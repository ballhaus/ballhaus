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
                                    'cmsApp.directives'],
                         ['$locationProvider', '$routeProvider', function($locationProvider, $routeProvider) {
                             
                             $locationProvider.html5Mode(true);

                             [ [ 'home' ],
                               [ 'events' ],
                               [ 'event/:eventId', EditEventController ],
                               [ 'pieces' ],
                               [ 'piece/:pieceId', EditPieceController ],
                               [ 'projects' ],
                               [ 'project/:pieceId', EditPieceController ],
                               [ 'enactment/:enactmentId', EditEnactmentController ],
                               [ 'people', PeopleController ],
                               [ 'homepage', EditHomepageController ],
                               [ 'pages', PagesController ],
                               [ 'page/:pageId', EditPageController ],
                               [ 'person/:personId', EditPersonController ],
                               [ 'videos' ],
                               [ 'tickets' ],
                               [ 'flickr-sets' ],
                               [ 'video/:videoId', VideoController ],
                               [ 'logos' ],
                             ].forEach(function (pageDef) {
                                 var pageName = pageDef[0];
                                 if (pageName == 'pages') {
                                     pageName = 'pages-' + siteConfig.name;
                                 }
                                 var def = { name: pageName,
                                             templateUrl: '/partials/cms/' + pageName.replace(/\/.*$/, "") + '.html' };
                                 var controller = pageDef[1];
                                 if (controller) {
                                     def.controller = pageDef[1];
                                     if (controller.resolve) {
                                         def.resolve = controller.resolve;
                                     }
                                 }
                                 $routeProvider.when('/cms/' + pageDef[0], def);
                             });

                             $routeProvider
                                 .otherwise({ redirectTo: '/cms/home' });
}]);

app.value('ui.config', {
    tinymce: {
        theme: 'advanced',
        theme_advanced_buttons1: "removeformat,bold,italic,|,h2,|,link,unlink,image",
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

    $scope.logo = siteConfig.logo;
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
        if (false) {                                        // fixme
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
        return true;                                        // fixme
    }

    $scope.uploadFile = function(files) {
        var formData = new FormData();
        // Take the first selected file
        formData.append("file", files[0]);
    }

    var statusPolled;                                       // "Sitzung beendet"-Meldung nicht anzeigen, wenn CMS frisch geladen wird

    function pollLoginStatus() {
        $http
            .get('/login-status', { params: { url: window.location.pathname } })
            .success(function (loginStatus) {
                console.log('statusPolled', statusPolled, 'localStorage.lockId', localStorage.lockId, 'loginStatus.uuid', loginStatus.uuid);
                if (statusPolled && localStorage.lockId && (loginStatus.uuid != localStorage.lockId)) {
                    delete localStorage.lockId;
                    db.close();
                    $dialog
                        .messageBox("Sitzung beendet", "Das System hat Deine Sitzung beendet",
                                    [ { result: 'ok', label: 'OK', cssClass: 'btn-danger' } ])
                        .open()
                        .then(function (result) {
                            window.location = "/cms";
                        });
                }
                if (!statusPolled) {
                    $('#spinner').hide();
                }
                statusPolled = true;
                if (loginStatus.uuid) {
                    if (loginStatus.uuid == localStorage.lockId) {
                    } else {
                        $rootScope.state = 'locked';
                        $rootScope.loggedInUser = loginStatus.name;
                    }
                } else {
                    $rootScope.state = 'loggedOut';
                    if (window.location.pathname != '/cms/home') {
                        window.location = '/cms/home';
                    }
                }
            })
            .error(function () {
                alert('cannot poll login status');
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
    $scope.newProject = function () {
        $dialog
            .dialog({ controller: 'NewNamedObjectController',
                      resolve: { defaults: function () { return { } } },
                      templateUrl: '/dialogs/new-project.html' })
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
                        $('#spinner').hide();
                        console.log('login success', loginStatus);
                        $rootScope.state = 'loggedIn';
                        localStorage.lockId = loginStatus.uuid;
                        $rootScope.superuser = loginStatus.superuser;
                        $location.path('/cms/events');
                    })
                    .error(function (message, status) {
                        $('#spinner').hide();
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
        delete localStorage.lockId;
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
    var pieceLabel = (siteConfig.name == 'ada') ? 'Projekt' : 'Stück';
    $scope.deletePiece = function () {
        confirm($dialog, pieceLabel + ' löschen', 'Das ' + pieceLabel + ' "' + $scope.piece.name + '" und alle Aufführungen wirklich löschen?',
                function () {
                    console.log('delete piece', $scope.piece.name);
                    $scope.piece.remove();
                    window.history.back();
                });
    }
}
EditPieceController.$inject = ['$scope', '$dialog', '$routeParams', 'db'];

function EditEnactmentController($scope, $dialog, $routeParams, db) {
    $scope.enactment = db.get(db.Enactment, $routeParams.enactmentId);
    if ($scope.enactment.rolesPeople && !$scope.enactment.rolesPeople.length) {
        delete $scope.enactment.rolesPeople;
    }
    $scope.deleteEnactment = function () {
        confirm($dialog, 'Aufführung löschen', 'Die Aufführung wirklich löschen?',
                function () {
                    db.deleteObject($scope.enactment);
                    window.history.back();
                });
    }
}
EditPieceController.$inject = ['$scope', '$dialog', '$routeParams', 'db'];

function PeopleController($scope, db) {
    $scope.matchingPerson = function (person) {
        return !$scope.query || (person.person.name.toLowerCase().indexOf($scope.query) != -1);
    }
    $scope.people = db.people().map(function (person) {
        return { person: person,
                 lastName: person.name.replace(/.* (.)/, "$1") };
    });
}
PeopleController.$inject = ['$scope', 'db'];

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

function EditHomepageController($scope, db) {
    $scope.pages = db.pages().filter(function (page) { return !page.linkedFromMenu; });
    $scope.pages.unshift(undefined);
    $scope.pieces = db.pieces();
    $scope.homepage = db.homepage;
}
EditHomepageController.$inject = ['$scope', 'db'];

function EditPageController($scope, $dialog, db, page) {
    $scope.page = page;
    console.log('EditPageController, page', $scope.page);

    $scope.deletePage = function () {
        confirm($dialog, 'Seite löschen', 'Die Seite wirklich löschen?',
                function () {
                    db.pages.remove({ id: $scope.page.id },
                                    function () {
                                        window.history.back();
                                    });
                });
    }
}

EditPageController.resolve = {
    page: function ($resource, $q, $route, db) {
        var deferred = $q.defer();
        $resource('/db/page/:pageId')
            .get(
                $route.current.params,
                function (data) {
                    deferred.resolve(data);
                },
                function () {
                    deferred.reject();
                });
        return deferred.promise;
    }
}

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

function LogosController($scope, $dialog, $http) {

    $scope.deleteLogo = function (logo) {
        confirm($dialog, 'Logo löschen', 'Logo ' + logo.filename + ' wirklich löschen?',
                function () {
                    $http.delete(logo.url)
                        .success(function () {
                            $scope.logos = $scope.logos.filter(function (otherLogo) {
                                return otherLogo != logo;
                            });
                        });
                });
    }

    $http.get('/logos')
        .success(function (result) {
            $scope.logos = result.logos.map(function (logo) {
                logo.url = '/logo/' + logo.filename;
                return logo;
            });
        });
}
LogosController.$inject = ['$scope', '$dialog', '$http'];

function ConfigurationController($scope) {
    $scope.editor = getConfig('editor');
    $scope.changeEditor = function (editor) {
        setConfig('editor', editor);
    }
}

function PagesController($scope, pages) {
    $scope.pages = pages;
}

PagesController.resolve = {
    pages: function($resource, $q) {
        var deferred = $q.defer();
        $resource('/db/page')
            .query(
                function (data) {
                    var map = {};
                    data.forEach(function (page) {
                        map[page.link] = page;
                    });
                    deferred.resolve(map);
                },
                function () {
                    deferred.reject();
                });
        return deferred.promise;
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
            return events && events.filter(function (event) {
                var isHistoric = (new Date(event.date)).getTime() < now.getTime();
                return historic ? isHistoric : !isHistoric;
            });
        }
    });

angular.module('cmsApp.directives', [])
    .directive("ref", [ '$compile', function ($compile) {
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
                $scope.id = $scope.object.id;
                var contents = angular.element('<a href="/cms/{{type}}/{{id}}">{{title}}</div>');
                element.replaceWith(contents);
                $compile(contents)($scope);
            }
        };
    }])
    .directive("menuLink", [ 'db', function (db) {
        return {
            restrict: 'E',
            replace: true,
            transclude: true,
            scope: true,
            template: '<li ng-class="getClass()"><a href="/cms/{{to}}" ng-transclude></a></li>',
            link: function ($scope, element, attributes) {
                $scope.directoryMatch = new RegExp('^(' + attributes.to + '|' + attributes.subs + ')$');
                $scope.getClass = function () {
                    var classes = [];
                    if (attributes.site && attributes.site != siteConfig.name) {
                        classes.push('hidden');
                    }
                    var urlMatch = window.location.href.match('/cms/([^/]+)');
                    if (urlMatch && $scope.directoryMatch.test(urlMatch[1])) {
                        classes.push("active");
                    }
                    return classes.join(' ');
                }
                $scope.to = attributes.to;
            }
        };
    }])
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
                        html += ' <input type="checkbox" ng-model="video.show_first"/> Video zuerst anzeigen'
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
                                $scope.model.push(response.image);
                                $scope.$$phase || $scope.$apply();
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
                                $scope.$$phase || $scope.$apply();
                            }
                        }
                    }
                });
            }
        }
    }])
    .directive("logoUploader", [ 'db', function(db) {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/cms/logo-uploader.html',
            link: function($scope, element, attributes) {
                new qq.FineUploader({
                    element: $(element).find('#uploader')[0],
                    request: {
                        endpoint: '/logo'
                    },
                    validation: {
                        allowedExtensions: ['png', 'gif', 'jpg']
                    },
                    callbacks: { 
                        onComplete: function(id, fileName, response) {
                            console.log('upload complete', id, 'fileName', fileName, 'response', JSON.stringify(response));
                            window.location = window.location;
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
                var thumbnailHeight = Math.min($scope.image.thumbnailHeight, $(element).height());
                var thumbnailWidth = Math.min($scope.image.thumbnailWidth, $(element).width());
                var top = Math.floor(($(element).height() / 2) - (thumbnailHeight / 2));
                var left = Math.floor(($(element).width() / 2) - (thumbnailWidth / 2));
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
                    $scope.$$phase || $scope.$apply();
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
                    scope.$$phase || scope.$apply(parse);
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
                var model = $scope.model;
                if (typeof model.participants == 'string' && !model.rolesPeople) {
                    model.processParticipants();
                }

                $scope.data = $scope.model.participants;
                $scope.ensurePerson = function (person) {
                    console.log('ensurePerson', person);
                    var object = db.Person.getByName(person.name);
                    if (!object) {
                        object = new db.Person(person);
                        $scope.model.processParticipants();
                    }
                }
                $scope.openEditor = function () {
                    console.log('openEditor');
                    $dialog
                        .dialog({ resolve: { model: function () { return angular.copy($scope.model.participants); } } })
                        .open('/dialogs/edit-participants.html', 'EditParticipantsController')
                        .then(function(participants) {
                            if (participants) {
                                $scope.model.participants = participants;
                                $scope.model.processParticipants();
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
    .directive('pageDirectory', ['db', '$dialog', '$location', '$resource', function (db, $dialog, $location, $resource) {

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
                                console.log('new page, data', data, 'db.pages', db.pages);
                                var link = utils.urlify(data.name);
                                db.pages
                                    .create({ name: { de: data.name },
                                              link: link },
                                            function (data) {
                                                $location.path('/cms/page/' + link);
                                            });
                            }
                        });
                }

                var linkedPages = {};
                $('.edit-menu a').each(function (x, node) {
                    linkedPages[$(node).attr('page')] = true;
                });

                $scope.freePages = [];
                for (var link in $scope.pages) {
                    if (linkedPages[link]) {
                        $scope.pages[link].linkedFromMenu = true;
                    } else {
                        $scope.freePages.push(link);
                    }
                }
            }
        }
    }])
    .directive("pageEditRef", [ function () {
        return {
            restrict: 'E',
            replace: true,
            scope: true,
            template: '<a href="/cms/page/{{id}}">{{title}}</a>',
            link: function ($scope, element, attributes) {
                attributes.$observe('page', function(link) {
                    var page = $scope.$parent.pages[link];
                    $scope.id = page ? page.id : "";
                    $scope.title = page ? page.name.de : "unknown page " + attributes.link;
                });
            }
        };
    }])
    .directive("boxContentsSelector", ['db', function (db) {
        return {
            restrict: 'E',
            scope: { model: '=model' },
            replace: true,
            templateUrl: '/partials/cms/box-contents-selector.html'
        };
    }])
    .directive("pagePieceEventSelector", ['db', function (db) {
        return {
            restrict: 'E',
            scope: { model: '=model' },
            replace: true,
            templateUrl: '/partials/cms/page-piece-event-selector.html',
            link: function ($scope, element, attrs, controller) {
                var now = new Date;
                /* this should really go into the enclosing scope */
                $scope.pieces = db.pieces().sort(function (a, b) { return a.name.localeCompare(b.name); });
                $scope.pages = db.pages().filter(function (page) { return !page.linkedFromMenu; }).sort(function (a, b) { return a.name.de.localeCompare(b.name.de); });
                $scope.events = db.events().filter(function (event) {
                    return event.date.getTime() > now.getTime() && event.constructor.name != 'Enactment';
                })
                    .sort(function (a, b) { return a.name.localeCompare(b.name); });
            }
        }
    }])
    .directive("previewLink", [ '$compile', function ($compile) {
        return {
            restrict: 'E',
            replace: true,
            link: function ($scope, element, attributes) {
                if (attributes.object) {
                    $scope.object = $scope.$eval(attributes.object);
                    $scope.previewLink = attributes.prefix + ($scope.object.link || $scope.object.id);
                } else {
                    $scope.previewLink = attributes.prefix;
                }
                $scope.realLink = siteConfig.url + $scope.previewLink;
                var contents = angular.element('<a class="preview" target="bhn-preview" href="{{previewLink}}">{{realLink}}</a>');
                element.replaceWith(contents);
                $compile(contents)($scope);
            }
        };
    }]);

