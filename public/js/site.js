var app = angular.module('siteApp', ['ui.bootstrap', 'ngResource', '$strap.directives', 'ngSanitize'])
.filter('join', function () {
    return function (input, arg) {
      return input && input.join(arg);
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

function ScheduleController($scope, $routeParams, db) {
    $scope.translate = translate;
    if ($routeParams.month) {
        $scope.month = $routeParams.month;
    } else {
        $scope.month = moment().format('MM-YYYY');
    }
    var now = new Date;
    var events = db.events().filter(function (event) {
      return event.date.getTime() > now.getTime();
    }).map(function (event) {
        console.log(event);
        var date = moment(event.date);
        var by = event.by;
        if (!event.by && event.piece) {
            by = event.piece.by;
        }
        var link = event.link;
        if (link) {
            link = '/veranstaltung/' + event.link;
        } else {
            link = '/stueck/' + event.piece.link;
        }
        return {
            name: event.name || event.piece.name,
            link: link,
            by: translate(by),
            weekday: date.format('dddd'),
            date: date.format('Do MMMM'),
            time: date.format('H:mm'),
            month: date.format('MMMM'),
            monthKey: date.format('MM-YYYY'),
            epochSeconds: event.date.getTime(),
            tags: event.tags || (event.piece && event.piece.tags && event.piece.tags)
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
    
    console.log('events', events);
}
ScheduleController.$inject = ['$scope', '$routeParams', 'db'];

function PersonPageController($scope, $routeParams) {
    $scope.person = $scope.db.get($scope.db.Person, $routeParams.personId);

}
PersonPageController.$inject = ['$scope', '$routeParams'];

function PiecePageController($scope, $routeParams) {
    $scope.piece = $scope.db.get($scope.db.Piece, $routeParams.pieceId);

}
PiecePageController.$inject = ['$scope', '$routeParams'];

function EventPageController($scope, $routeParams) {
    $scope.event = $scope.db.get($scope.db.Event, $routeParams.eventId);

}
EventPageController.$inject = ['$scope', '$routeParams'];

app.config(['$locationProvider', '$routeProvider', function($locationProvider, $routeProvider) {

    $locationProvider.html5Mode(true);

    [ [ 'home' ],
      [ 'repertoire' ],
      [ 'spielplan', ScheduleController ],
      [ 'spielplan/:month', ScheduleController ],
      [ 'person/:personId', PersonPageController ],
      [ 'stueck/:pieceId', PiecePageController ],
      [ 'veranstaltung/:eventId', EventPageController ]
    ].forEach(function (pageDef) {
        var def = { name: pageDef[0],
                    templateUrl: '/partials/' + pageDef[0].replace(/\/.*$/, "") + '.html' };
        if (pageDef[1]) {
            def.controller = pageDef[1];
        }
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

                    var page = db.get(db.Page, pageName);

                    var html;
                    if (page) {
                        $scope.title = page.name;
                        html = '<div>' + translate(page.contents) + '</div>';
                    } else {
                        $scope.title = 'Seite nicht gefunden';
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
    .directive("todayLink", function (db) {
        return {
            restrict: 'E',
            replace: true,
            template: '<div id="today-link"><a href="#">Heute, 21.6.13</a></div>'
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
