var app = angular.module('siteApp', ['ui.bootstrap', 'ngResource', '$strap.directives', 'ngSanitize'])
.filter('join', function () {
    return function (input, arg) {
      return input && input.join(arg);
    };
})
.filter('orSpace', function () {
    return function (input) {
      return input || '\u00a0';
    }
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
    return input && input.replace(/^(.+): (.+)$/mg, '<p><em>$1</em><br/>$2</p>')
      .replace(/,/g, '<br />');
  };
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

function RepertoireController($scope, db, Page) {
    $scope.pieces = db.pieces();
    Page.setTitle('Repertoire');
    Page.setSidebarContent('');
}

function ScheduleController($scope, $routeParams, db, Page) {
    if ($routeParams.month) {
        $scope.month = $routeParams.month;
    } else {
        $scope.month = moment().format('MM-YYYY');
    }
    var now = new Date;
    var events = db.events().filter(function (event) {
      return event.date.getTime() > now.getTime();
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
            by: event.by || (event.piece && event.piece.by),
            weekday: date.format('dddd'),
            date: date.format('Do MMMM'),
            time: date.format('H:mm'),
            month: date.format('MMMM'),
            monthKey: date.format('MM-YYYY'),
            epochSeconds: event.date.getTime(),
            tags: event.tags || (event.piece && event.piece.tags)
        };
    });
    $scope.events = events.sort(function (a, b) { return a.epochSeconds - b.epochSeconds });

    $scope.months = [];
    var oldMonthKey;
    $scope.events.forEach(function (event) {
        if (event.monthKey != oldMonthKey) {
            $scope.months.push({ name: event.month,
                                 key: event.monthKey });
            oldMonthKey = event.monthKey;
        }
    });
    Page.setTitle('Spielplan');
    Page.setSidebarContent('');
}

function PersonPageController($scope, $routeParams, Page) {
    $scope.person = $scope.db.get($scope.db.Person, $routeParams.personId);
    Page.setTitle($scope.person.name);
    Page.setSidebarContent('');
}

function PiecePageController($scope, $routeParams, Page, $compile) {
    $scope.piece = $scope.db.get($scope.db.Piece, $routeParams.pieceId);
    Page.setTitle($scope.piece.name);
    Page.setSidebarContent($compile('<piece-sidebar for="piece"/>')($scope));
}

function EventPageController($scope, $routeParams, Page, $compile) {
    $scope.event = $scope.db.get($scope.db.Event, $routeParams.eventId);
    Page.setTitle($scope.event.name);
    Page.setSidebarContent($compile('<piece-sidebar for="event"/>')($scope));
}

function EnactmentPageController($scope, $routeParams, Page, $compile) {
    $scope.enactment = $scope.db.get($scope.db.Enactment, $routeParams.enactmentId);
    Page.setTitle($scope.enactment.piece.name); //FIXME
    Page.setSidebarContent($compile('<piece-sidebar for="enactment.piece"/>')($scope));
}

function KuenstlerinnenController($scope, Page, db) {
    $scope.people = db.people();
    Page.setTitle('Künstlerinnen');
    Page.setSidebarContent('');
}

function PageController($scope, Page) {
    $scope.Page = Page;
}
app.factory('Page', function () {
    var title = '';
    var sidebar = null;
    return {
        title: function() { return title; },
        setTitle: function(newTitle) { title = newTitle; },
        customSidebar: function () { return sidebar !== null && typeof sidebar !== 'undefined'; },
        sidebarContent: function () { return sidebar; },
        setSidebarContent: function (newSidebar) { sidebar = newSidebar; }
    };
});

app.config(['$locationProvider', '$routeProvider', function($locationProvider, $routeProvider) {

    $locationProvider.html5Mode(true);

    [ [ 'repertoire', RepertoireController ],
      [ 'spielplan', ScheduleController ],
      [ 'spielplan/:month', ScheduleController ],
      [ 'person/:personId', PersonPageController ],
      [ 'stueck/:pieceId', PiecePageController ],
      [ 'auffuehrung/:enactmentId', EnactmentPageController ],
      [ 'veranstaltung/:eventId', EventPageController ],
      [ 'kuenstlerinnen', KuenstlerinnenController ]
    ].forEach(function (pageDef) {
        var def = { name: pageDef[0],
                    templateUrl: '/partials/' + pageDef[0].replace(/\/.*$/, "") + '.html',
                    controller: pageDef[1] };
        $routeProvider.when('/' + pageDef[0], def);
    });

    $routeProvider
        .otherwise({ template: '<content/>' });
}]);

app
    .filter('reverse', function() {
        return function(items) {
            return items.slice().reverse();
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
            template: '<li><a class="site-menuitem-{{to}} ir" href="/{{to}}" ng-transclude></a></li>',
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
    .directive("mediaBrowser", function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/media-browser.html',
            scope: { model: '=model' },
            link: function ($scope, element, attributes) {

                $scope.media = $scope.model.images.slice();

                $scope.media.forEach(function (picture) { picture.type = 'picture' });
                if ($scope.model.video) {
                    $scope.model.video.type = 'video';
                    $scope.media.push($scope.model.video);
                }
                $scope.mediumIndex = 0;

                $scope.previousIconClass = function () {
                    var iconClass = 'icon-left';
                    if ($scope.mediumIndex != 0) {
                        iconClass += " icon-white";
                    }
                    return iconClass;
                }

                $scope.nextIconClass = function () {
                    var iconClass = 'icon-right';
                    if ($scope.mediumIndex != ($scope.media.length - 1)) {
                        iconClass += " icon-white";
                    }
                    return iconClass;
                }

                $scope.mediumClass = function () {
                    var iconClass = "icon-" + this.medium.type;
                    if ($scope.mediumIndex != $scope.media.indexOf(this.medium)) {
                        iconClass += " icon-white";
                    }
                    return iconClass;
                }

                $scope.clickMedium = function () {
                    $scope.mediumIndex = $scope.media.indexOf(this.medium);
                    $scope.showMedium();
                }

                $scope.showMedium = function () {
                    var medium = $scope.media[$scope.mediumIndex];
                    var display = element.find('.display');
                    display.children().remove();

                    function showPicture() {
                        var image = medium;
                        var width, height;
                        if (image.width < image.height) {
                            width = image.width * (450 / image.height);
                            height = 450;
                        } else {
                            width = 600;
                            height = image.height * (600 / image.width);
                        }
                        var left = (600 / 2) - (width / 2);
                        var top = (450 / 2) - (height / 2);
                        display.append(angular.element('<img src="/image/' + image.name
                                                       + '" width="' + width + '" height="' + height
                                                       + '" style="left: ' + left + 'px; top: ' + top + 'px;"/>'));
                    }

                    function showVideo() {
                        display.append(angular.element('<iframe src="http://player.vimeo.com/video/ ' + medium.id
                                                       + '" width="' + 600 + '" height="' + 450
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
