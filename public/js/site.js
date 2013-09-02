var app = angular.module('siteApp', ['ui.bootstrap', 'ngResource', '$strap.directives', 'ngSanitize'])
.filter('join', function () {
    return function (input, arg) {
        return input && input.join(arg);
    };
})
.filter('or', function () {
    return function (input, arg) {
        return input || arg;
    };
})
.filter('orSpace', function () {
    return function (input) {
        return input || '\u00a0';
    };
})
.filter('toDate', function () {
    return function (input) {
        return moment(input).format('Do MMMM YYYY');
    };
})
.filter('translate', function () {
    return translate;
})
.filter('formatParticipants', function () {
    return function(input) {
        if (!input) { return ''; }
        return input.map(function (role) {
            return '<div><em>' + role.role + '</em><ul class="participants-list">' + role.people.map(function (person) {
                return '<li><a href="/person/' + person.link + '">' + person.name + '</a></li>';
            }).join('') + '</ul></div>';
        }).join('');
    };
})
.filter('fromCharCode', function () {
    return function (input) {
        return String.fromCharCode(input);
    }
});

var language = 'de';

function translate(what) {
    switch (typeof what) {
    case 'string':
        return what;
    case 'object':
        return what[language];
    }
}

// FIXME: Ugly c&p from CMS
function peopleMatch(db, string) {
    var data = [];
    var re = /(.*):\s*(.*)/g;
    var match;
    while ((match = re.exec(string)) !== null) {
        // console.log(match[1], match[2].split(/\s*,\s*/));
        data.push({ role: match[1],
                    people: match[2].split(/\s*,\s*/).map(function (name) {
                        var person = db.Person.getByName(name);
                        return { name: name,
                                 link: (person ? person.link : utils.urlify(name)) };
                    })});
    }
    return data;
}

function RepertoireController($scope, db, Page) {
    var seen = {};
    $scope.pieces = [];
    var now = moment().unix();
    db.events().forEach(function (event) {
        if (event.piece && !seen[event.piece.id] && (moment(event.date).unix() >= now)) {
            $scope.pieces.push(event.piece);
            seen[event.piece.id] = true;
        }
    });
    console.log('got', $scope.pieces.length, 'total', db.pieces().length);

    Page.setTitle('Repertoire');
    Page.setSidebarContent('');
}

function PressPdfController($scope, db, Page) {
    $scope.events = db.findObjects(db.Event).concat(db.pieces())
        .filter(function (event) {
            return event.presse;
        })
        .map(function (event) {
            console.log('event', event);
            return {
                name: event.name || (event.piece && event.piece.name),
                date: event.date && moment(event.date).format('Do MMMM YYYY'),
                epochSeconds: event.date && event.date.getTime(),
                pdf: event.presse
            };
        });
    Page.setTitle('Pressemitteilungen');
    Page.setSidebarContent('');
}

function PressImagesController($scope, db, Page) {
    $scope.sets = db.flickrSets
        .map(function (set) {
            var m = moment(set.date_update * 1000);
            return {
                id: set.id,
                epochSeconds: m.unix(),
                date: m.format('Do MMMM YYYY'),
                name: set.title._content
            };
        });
    Page.setTitle('Bildmaterial');
    Page.setSidebarContent('');
}

app.service('schedule', function (db) {
    function get (archive) {
        var now = new Date;
        var events = db.events().filter(function (event) {
          return Boolean(archive) !== (event.date.getTime() > now.getTime());
        }).map(function (event) {
            var date = moment(event.date);
            var link = event.link;
            if (link) {
                link = '/veranstaltung/' + event.link;
            } else {
                link = '/auffuehrung/' + event.id;
            }
            return {
                name: event.name || (event.piece && event.piece.name),
                link: link,
                ticketLink: event.ticketLink,
                by: event.by || (event.piece && event.piece.by),
                weekday: date.format('dddd'),
                date: date.format('Do MMMM'),
                time: date.format('H:mm'),
                month: date.format('MMMM'),
                monthKey: date.format('MM-YYYY'),
                epochSeconds: event.date.getTime(),
                tags: event.tags || (event.piece && event.piece.tags)
            };
        }).sort(function (a, b) { return a.epochSeconds - b.epochSeconds });
        return events;
    }
    this.getUpcoming = get.bind(null, false);
    this.getArchive = get.bind(null, true);
});


function ScheduleController($scope, $routeParams, schedule, Page) {
    var events = schedule.getUpcoming();

    $scope.month = $routeParams.month || moment().format('MM-YYYY');

    // Determine months
    $scope.months = events.reduce(function (state, event) {
        if (event.monthKey != state.oldMonthKey) {
            state.months.push({
                name: event.month,
                key: event.monthKey,
                curClass: event.monthKey === $scope.month ? 'active' : ''
            });
            state.oldMonthKey = event.monthKey;
        }
        return state;
    }, {months: [], oldMonthKey: undefined}).months;

    // Filter by month
    $scope.events = events.filter(function (event) {
      return event.monthKey === $scope.month;
    });

    Page.setTitle('Spielplan');
    Page.setSidebarContent('');
}

function ArchiveController($scope, schedule, Page) {
    $scope.events = schedule.getArchive();
    Page.setTitle('Archiv');
    Page.setSidebarContent('');
}

function PersonPageController($scope, $routeParams, Page) {
    $scope.person = $scope.db.get($scope.db.Person, $routeParams.personId);
    Page.setTitle($scope.person ? $scope.person.name : 'Person nicht gefunden');
    Page.setSidebarContent('');
}

function PiecePageController($scope, $routeParams, Page, $compile) {
    $scope.piece = $scope.db.get($scope.db.Piece, $routeParams.pieceId);
    $scope.piece.participants = peopleMatch($scope.db, $scope.piece.participants);
    Page.setTitle($scope.piece.name);
    Page.setSidebarContent($compile('<piece-sidebar for="piece"/>')($scope));
}

function EventPageController($scope, $routeParams, Page, $compile) {
    $scope.event = $scope.db.get($scope.db.Event, $routeParams.eventId);
    $scope.event.participants = peopleMatch($scope.db, $scope.event.participants);
    Page.setTitle($scope.event.name);
    Page.setSidebarContent($compile('<piece-sidebar for="event"/>')($scope));
}

function EnactmentPageController($scope, $routeParams, Page, $compile) {
    var enactment = $scope.db.get($scope.db.Enactment, $routeParams.enactmentId);
    $scope.enactment = angular.extend({}, enactment.piece, enactment);
    $scope.enactment.participants = peopleMatch($scope.db, $scope.enactment.participants);
    Page.setTitle($scope.enactment.name);
    Page.setSidebarContent($compile('<piece-sidebar for="enactment"/>')($scope));
}

function KuenstlerinnenController($scope, $routeParams, Page, db) {
    $scope.people = db.people().filter(function (person) {
        return person.bio && (person.bio.de || person.bio.en) && person.images && person.images.length;
    });

    $scope.letters = $scope.people.reduce(function (letters, person) {
        var c = utils.urlify(person.name.charAt(0)).toUpperCase().charCodeAt(0);
        letters[c] = 'letter-present';
        return letters;
    }, Array('Z'.charCodeAt(0) + 1));
    $scope.letters.offset = 0;
    while ($scope.letters[$scope.letters.offset++] !== 'letter-present' &&
        $scope.letters.offset < 'A'.charCodeAt(0)) {
    }

    if ($routeParams.letter) {
        $scope.people = $scope.people.filter(function (person) {
            return utils.urlify(person.name.charAt(0)).toUpperCase() === $routeParams.letter;
        });
    }

    Page.setTitle('Künstlerinnen' + ($routeParams.letter ? ' ' + $routeParams.letter : ''));
    Page.setSidebarContent('');
}

function PageController($scope, Page) {
    $scope.Page = Page;

    $scope.$on('$routeChangeSuccess', function (e, newRoute) {
        $scope.Page.currentMenuItem(newRoute.$route && newRoute.$route.activeMenuItem);
    });
}
app.factory('Page', function () {
    var title = '';
    var sidebar = null;
    var curMenuItem;
    return {
        title: function() { return title; },
        setTitle: function(newTitle) { title = newTitle; },
        customSidebar: function () { return sidebar !== null && typeof sidebar !== 'undefined'; },
        sidebarContent: function () { return sidebar; },
        setSidebarContent: function (newSidebar) { sidebar = newSidebar; },
        menuClass: function (item) { return item === curMenuItem ? 'active' : ''; },
        currentMenuItem: function (newCurMenuItem) { curMenuItem = newCurMenuItem; }
    };
});

app.config(function($locationProvider, $routeProvider) {

    $locationProvider.html5Mode(true);

    [ { name: 'repertoire', controller: RepertoireController, activeMenuItem: 'Programm' },
      { name: 'archiv', controller: ArchiveController, activeMenuItem: 'Programm' },
      { name: 'spielplan', controller: ScheduleController, activeMenuItem: 'Programm' },
      { name: 'spielplan/:month', controller: ScheduleController, activeMenuItem: 'Programm' },
      { name: 'person/:personId', controller: PersonPageController, activeMenuItem: 'kuenstlerinnen' },
      { name: 'stueck/:pieceId', controller: PiecePageController, activeMenuItem: 'Programm' },
      { name: 'auffuehrung/:enactmentId', controller: EnactmentPageController, activeMenuItem: 'Programm' },
      { name: 'veranstaltung/:eventId', controller: EventPageController, activeMenuItem: 'Programm' },
      { name: 'kuenstlerinnen', controller: KuenstlerinnenController },
      { name: 'kuenstlerinnen/:letter', controller: KuenstlerinnenController, activeMenuItem: 'kuenstlerinnen' },
      { name: 'pressemitteilungen', controller: PressPdfController, activeMenuItem: 'Presse' },
      { name: 'bildmaterial', controller: PressImagesController, activeMenuItem: 'Presse' }
    ].forEach(function (pageDef) {
        pageDef.templateUrl = '/partials/' + pageDef.name.replace(/\/.*$/, "") + '.html';
        pageDef.activeMenuItem = pageDef.activeMenuItem || pageDef.name;
        $routeProvider.when('/' + pageDef.name, pageDef);
    });

    $routeProvider
        .otherwise({ template: '<content/>' });
});

app
    .filter('reverse', function() {
        return function(items) {
            return items && items.slice().reverse();
        };
    })
    .directive("includeDb", ['$rootScope', 'db', function ($rootScope, db) {
        return {
            restrict: 'A',
            link: function ($scope, element, attributes) {
                $rootScope.db = db;
            }
        }
    }])
    .directive("menu", function () {
        return {
            restrict: 'E',
            replace: true,
            transclude: true,
            template: '<nav><ul ng-cloak ng-transclude></ul></nav>',
            link: function ($scope, element, attributes) {
                $scope.$on('$routeChangeSuccess', function (event, current, previous) {
                    console.log('$routeChangeSuccess');
                });
            }
        }
    })
    .directive("subMenu", function () {
        return {
            restrict: 'E',
            replace: true,
            transclude: true,
            scope: true,
            templateUrl: '/partials/submenu.html',
            link: function ($scope, element, attributes) {
                $scope.title = attributes.name;
                $scope.linkTarget = attributes.link;
            }
        }
    })
    .directive("menuItem", [ '$location', function ($location) {
        return {
            restrict: 'E',
            replace: true,
            transclude: true,
            scope: true,
            template: '<li><a class="site-menuitem-{{to}} ir" ng-class="Page.menuClass(to)" href="/{{to}}" ng-transclude></a></li>',
            link: function ($scope, element, attributes) {
                $scope.to = attributes.to || utils.urlify(element.text());
            }
        };
    }])
    .directive("content", ['$compile', function ($compile) {
        return {
            restrict: 'E',
            replace: true,
            scope: true,
            link: function ($scope, element, attributes) {
                var db = $scope.db;
                function doit () {
                    var pageName = window.location.pathname.substr(1);
                    if (pageName == '') {
                        pageName = 'home';
                    }

                    $scope.Page.setSidebarContent();
                    $scope.Page.currentMenuItem({
                        'home': '',
                        'geschichte': 'Haus',
                        'team': 'Haus',
                        'auszeichnungen': 'Haus',
                        'postmigranten_on_tour': 'Haus',
                        'partner': 'Haus',
                        'tickets': 'tickets',
                        'reihen': 'Programm'
                    }[pageName]);

                    var page = db.get(db.Page, pageName);

                    var html;
                    if (page) {
                        $scope.Page.setTitle(page.name);
                        html = '<div>' + translate(page.contents) + '</div>';
                    } else {
                        $scope.Page.setTitle('Seite nicht gefunden');
                        html = '<span>Die Seite "' + pageName + '" wurde nicht gefunden</span>';
                    }
                    var contents = angular.element(html);
                    element.replaceWith(contents);
                    $compile(contents)($scope);
                    if (!$scope.$$phase) {
                        $scope.$apply();
                    }
                }

                function pollDb() {
                    if (db.loaded) {
                        doit();
                    } else {
                        setTimeout(pollDb, 100);
                    }
                }

                pollDb();
            }
        };
    }])
    .directive("prices", function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/prices.html',
            scope: { for: '=' }
        };
    })
    .directive("pieceSidebar", function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/piece-sidebar.html',
            scope: { for: '=' }
        };
    })
    .directive("pieceBase", function () {
        return {
            restrict: 'E',
            transclude: true,
            replace: true,
            templateUrl: '/partials/piece-base.html',
            scope: { piece: '=' }
        };
    })
    .directive("ticketLink", function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/ticket-link.html',
            scope: { for: '=' }
        };
    })
    .directive("eventList", function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/event-list.html',
            scope: { events: '=' }
        };
    })
    .directive("mediaBrowser", function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/media-browser.html',
            scope: { model: '=' },
            link: function ($scope, element, attributes) {

                $scope.media = ($scope.model && $scope.model.images || []).slice();

                $scope.media.forEach(function (picture) { picture.type = 'picture' });
                if ($scope.model && $scope.model.video) {
                    $scope.model.video.type = 'video';
                    $scope.media.push($scope.model.video);
                }
                $scope.mediumIndex = 0;

                $scope.mediumClass = function () {
                    return "icon-" + this.medium.type;
                }

                $scope.clickMedium = function () {
                    $scope.mediumIndex = $scope.media.indexOf(this.medium);
                    $scope.showMedium();
                }

                $scope.showMedium = function () {
                    var medium = $scope.media[$scope.mediumIndex];
                    if (!medium) return;

                    var display = element.find('.display');
                    display.empty();

                    var maxWidth = 670;
                    var maxHeight = 426;
                    var maxVideoHeight = 376;
                    function showPicture() {
                        var image = medium;
                        var width, height;
                        if (image.width / maxWidth < image.height / maxHeight) {
                            width = image.width * (maxHeight / image.height);
                            height = maxHeight;
                        } else {
                            width = maxWidth;
                            height = image.height * (maxWidth / image.width);
                        }
                        display.append(angular.element('<img src="/image/' + image.name
                                                       + '" width="' + width + '" height="' + height
                                                       + '" />'));
                    }

                    function showVideo() {
                        display.append(angular.element('<iframe src="http://player.vimeo.com/video/ ' + medium.id
                                                       + '" width="' + maxWidth + '" height="' + maxVideoHeight
                                                       + '" frameborder="0" webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>'));
                    }

                    switch (medium.type) {
                    case 'picture':
                        showPicture();
                        break;
                    case 'video':
                        showVideo();
                        break;
                    default:
                        console.log('unknown medium type', medium.type);
                    }
                }

                $scope.gotoMedium = function (direction) {
                    $scope.mediumIndex += direction;
                    if ($scope.mediumIndex < 0) {
                        $scope.mediumIndex = 0;
                    } else if ($scope.mediumIndex >= $scope.media.length) {
                        $scope.mediumIndex = $scope.media.length - 1;
                    }
                    $scope.showMedium();
                }

                $scope.showMedium();
            }
        }
    });
