var app = angular.module('siteApp', ['ui.bootstrap', 'ngResource', '$strap.directives', 'ngSanitize'])
.filter('join', function () {
    return function (input, arg) {
        return input && input.join(arg);
    };
})
.filter('dontBreak', function () {
    return function (input) {
        return input && input.replace(/ /g, '\u00a0');
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
.filter('toDateWithTime', function () {
    return function (input) {
        return input && moment(input).format('Do MMMM YYYY, HH:mm [Uhr]');
    };
})
.filter('formatDate', function () {
    return function (input, format) {
        return moment(input).format(format);
    };
})
.filter('translate', function () {
    return translate;
})
.filter('fromCharCode', function () {
    return function (input) {
        return String.fromCharCode(input);
    };
})
.filter('onlyTeaser', function () {
    return function (input) {
        return input && input.substr(0, input.indexOf('\u06DD'));
    };
})
.filter('noTeaser', function () {
    return removeTeaserMarker;
});

function removeTeaserMarker(input) {
    return input && input.replace('\u06DD', '');
};

var language = 'de';

moment.lang(language);

function translate(what) {
    switch (typeof what) {
    case 'string':
        return what;
    case 'object':
        return what[language];
    }
};

// FIXME: Ugly c&p from CMS
function peopleMatch(db, string) {
    var data = [];
    var re = /(.*):\s*(.*)/g;
    var match;
    while ((match = re.exec(string)) !== null) {
        // console.log(match[1], match[2].split(/\s*,\s*/));
        data.push({ role: match[1],
                    people: match[2].split(/\s*,\s*/).map(function (name) {
                        var res = { name: name };
                        var person = db.Person.getByName(name);
                        if (person) {
                            res.link = person.link;
                        }
                        return res;
                    })});
    }
    return data;
}

function intoRect(rect, item) {
    var res = Object.create(item);
    if (item.width / rect.width < item.height / rect.height) {
      res.width = item.width * (rect.height / item.height);
      res.height = rect.height;
    } else {
      res.width = rect.width;
      res.height = item.height * (rect.width / item.width);
    }
    return res;
}

function HomeController($scope, db, Page, schedule) {
    db.promise.then(function () {
        var homepage = db.homepage;
        var start = 1;
        var firstBox;
        if (homepage.layout === 1) {
            $scope.headColumn = cleanColumn({width: 670, height: 426}, [ homepage.page1 ]);
            ++start;
        }
        if (homepage.layout === 2) {
            firstBox = homepage.page1;
            ++start;
        }
        if (!firstBox) {
            schedule.getUpcoming().then(function (upcoming) {
                firstBox = Object.create(upcoming[0]);
                firstBox.nextPiece = true;
                firstBox.date = moment(firstBox.date);
                firstBox.howSoon = firstBox.date.isSame(moment(), 'day') ? 'today' : (
                    firstBox.date.isSame(moment().add('d', 1), 'day') ? 'tomorrow' : 'future');
                firstBox.dateIntro = {
                  today: 'heute,',
                  tomorrow: 'morgen,',
                  future: 'am'
                }[firstBox.howSoon];
                setColumns();
            });
        } else {
            setColumns();
        }

        function setColumns() {
            $scope.columns = [
            [
                firstBox,
                homepage['page' + (start+1)]
            ], [
                homepage['page' + (start)],
                homepage['page' + (start+2)]
            ]];

            if (homepage.layout === 0) {
                $scope.columns[0].push(homepage['page' + (start+3)]);
                $scope.columns[1].push(homepage['page' + (start+4)]);
            }

            $scope.columns = $scope.columns.map(function (c) {
                return cleanColumn({width: 320, height: 240}, c);
            });
        }

        function cleanColumn(dimensions, c) {
            return c.filter(function (box) {
                return box;
            }).map(function (box) {
                if (box.images && box.images.length > 0) {
                    box = Object.create(box);
                    box.images = box.images.slice();
                    box.images[0] = intoRect(dimensions, box.images[0]);
                }
                return box;
            });
        }

        Page.setTitle('');
        Page.marginals(cleanColumn({width: 121, height: 96}, [
            homepage.marginal1, homepage.marginal2, homepage.marginal3
        ]));
    });
}

function RepertoireController($scope, db, Page) {
    var seen = {};
    $scope.pieces = [];
    var now = moment();
    db.promise.then(function () {
        db.events().forEach(function (event) {
            if (!event.piece || seen[event.piece.id]) {
                return;
            }
            if ((!moment(event.date).isBefore(now, 'day')) || event.piece.repertoire) {
                if (event.piece.images && event.piece.images[0]) {
                  event.piece.imageSize = intoRect({width: 176, height: 112}, event.piece.images[0]);
                }
                $scope.pieces.push(event.piece);
                seen[event.piece.id] = true;
            }
        });
    });

    Page.setTitle('Repertoire');
    Page.setSidebarContent('');
}

function PressPdfController($scope, db, Page) {
    db.promise.then(function () {
        $scope.events = db.findObjects(db.Event).concat(db.pieces())
            .filter(function (event) {
                return event.presse;
            })
            .map(function (event) {
                console.log('event ' + event);
                return {
                    name: event.name || (event.piece && event.piece.name),
                    date: event.date && moment(event.date).format('Do MMMM YYYY'),
                    epochSeconds: event.date && event.date.getTime(),
                    pdf: event.presse
                };
            });
    });
    Page.setTitle('Pressemitteilungen');
    Page.setSidebarContent('');
}

function PressImagesController($scope, db, Page) {
    db.promise.then(function () {
        $scope.sets = db.pieces()
            .filter(function (piece) { return piece.flickrSet; })
            .map(function (piece) {
                return {
                    id: piece.flickrSet.id,
                    name: piece.name
                };
            });
    });
    Page.setTitle('Bildmaterial');
    Page.setSidebarContent('');
}

app.service('schedule', function (db, $q) {
    function get (archive) {
        var deferred = $q.defer();
        db.promise.then(function () {
            var events = db.events().filter(function (event) {
              return Boolean(archive) !== event.isCurrent();
            }).map(function (event) {
                var date = moment(event.date);
                var link = event.link;
                if (link) {
                    link = '/veranstaltung/' + event.link;
                } else {
                    link = '/auffuehrung/' + event.id;
                }
                return angular.extend({}, event.__proto__, event.piece, event, {
                    link: link,
                    month: date.format('MMMM'),
                    monthKey: date.format('MM-YYYY'),
                    epochSeconds: event.date.getTime()
                });
            }).sort(function (a, b) { return a.epochSeconds - b.epochSeconds });

            deferred.resolve(events);
        });
        return deferred.promise;
    }
    this.getUpcoming = get.bind(null, false);
    this.getArchive = get.bind(null, true);
});


function ScheduleController($scope, $routeParams, schedule, Page) {
    $scope.month = $routeParams.month || moment().format('MM-YYYY');

    schedule.getUpcoming().then(function (events) {
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

        $scope.years = Object.keys($scope.months.reduce(function (ys, m) {
            ys[m.key.substr(3)] = true;
            return ys;
        }, {})).sort();

        // Filter by month
        $scope.events = events.filter(function (event) {
          return event.monthKey === $scope.month;
        });
    });

    Page.setTitle('Spielplan');
    Page.setSidebarContent('');
}

function ArchiveController(db, $scope, $routeParams, schedule, Page) {
    $scope.date = $routeParams.date || moment().format('YYYY'); // FIXME: last available year, not current
    $scope.curYear = ($scope.date.length > 4) ? $scope.date.substr(3) : $scope.date;
    $scope.category = $routeParams.category;

    $scope.months = {};
    for (var i = 1; i <= 12; ++i) {
      var m = moment(i + '-' + $scope.curYear, 'M-YYYY');
      $scope.months[i] = {
        name: m.format('MMMM'),
        key: m.format('MM-YYYY'),
        curClass: 'muted'
      };
    }

    schedule.getArchive().then(function (events) {
        $scope.years = events.reduce(function (state, event) {
            var year, isCurrent;
            if (event.monthKey != state.oldMonthKey) {
                year = event.monthKey.substr(3);
                isCurrent = $scope.date === year || $scope.date.substr(3) === year;
                if (!state.years[year]) {
                    state.years[year] = {
                        name: year,
                        curClass: isCurrent ? 'active' : '',
                    };
                }
                if (isCurrent) {
                    $scope.months[moment(event.date).month() + 1].curClass = event.monthKey === $scope.date ? 'active' : '';
                }
                state.oldMonthKey = event.monthKey;
            }
            return state;
        }, {years: {}, oldMonthKey: undefined}).years;

        $scope.months = Object.keys($scope.months).sort(function (a, b) {return a-b;}).map(function (k) {
            return $scope.months[k];
        });

        // Convert to sorted array
        $scope.years = Object.keys($scope.years).sort().map(function (k) {
            return $scope.years[k];
        });

        $scope.events = events
            // Filter by date
            .filter(function (event) {
                return (($scope.date.length === 4) ? event.monthKey.substr(3) : event.monthKey) === $scope.date;
            })

            // Filter by categories
            .filter(function (event) {
                return !$scope.category || event.tags.map(utils.urlify).indexOf($scope.category) !== -1;
            })

            // FIXME: Moving the reverse call to the template kills angular
            .reverse();
    });

    db.promise.then(function () {
        $scope.availableTags = db.tags().map(function (tag) {
            var urlTag = utils.urlify(tag.name);
            if ($scope.category === urlTag) {
                tag['class'] = 'selected';
            }
            tag.urlName = urlTag;
            return tag;
        });
    });

    $scope.showFilterSet = $scope.category;
    $scope.toggleFilterSet = function () {
        $scope.showFilterSet = !$scope.showFilterSet;
    };

    $scope.resetFilterSet = function () {
        $scope.category = null;
        $scope.showFilterSet = false;
    };

    $scope.title = {
      de: 'Archiv',
      en: 'Archive'
    }
    Page.setTitle($scope.title);
    Page.setSidebarContent('');
}

function PersonPageController($scope, db, $routeParams, Page) {
    db.promise.then(function () {
        $scope.person = db.get(db.Person, $routeParams.personId);
        Page.setTitle($scope.person ? $scope.person.name : 'Person nicht gefunden');
    });
    Page.setSidebarContent('');
}

function PiecePageController($scope, db, $routeParams, Page, $compile) {
    db.promise.then(function () {
        $scope.piece = db.get(db.Piece, $routeParams.pieceId);
        Page.setTitle($scope.piece.name);
        Page.setSidebarContent($compile('<piece-sidebar for="piece"/>')($scope));
    });
}

function EventPageController($scope, db, $routeParams, Page, $compile) {
    db.promise.then(function () {
        $scope.event = db.get(db.Event, $routeParams.eventId);
        Page.setTitle($scope.event.name);
        Page.setSidebarContent($compile('<piece-sidebar for="event"/>')($scope));
    });
}

function EnactmentPageController($scope, db, $routeParams, Page, $compile) {
    db.promise.then(function () {
        var enactment = db.get(db.Enactment, $routeParams.enactmentId);
        $scope.enactment = angular.extend({}, enactment.__proto__, enactment.piece, enactment.archivedPiece || {}, enactment);
        Page.setTitle($scope.enactment.name);
        Page.setSidebarContent($compile('<piece-sidebar for="enactment"/>')($scope));
    });
}

app.service('artists', function (db, $q) {
    var pDeferred = $q.defer();
    var lDeferred = $q.defer();

    db.promise.then(function () {
        var people = db.people().filter(function (person) {
            return person.bio && (person.bio.de || person.bio.en) && person.images && person.images.length;
        }).map(function (person) {
            person.orderName = person.name.substr(person.name.lastIndexOf(' ') + 1);
            return person;
        });
        pDeferred.resolve(people);
    });

    pDeferred.promise.then(function (people) {
        var letters = people.reduce(function (letters, person) {
            var c = utils.urlify(person.orderName.charAt(0)).toUpperCase().charCodeAt(0);
            letters[c] = 'letter-present';
            return letters;
        }, Array('Z'.charCodeAt(0) + 1));

        letters.offset = 0;
        while (letters[letters.offset++] !== 'letter-present' &&
            letters.offset < 'A'.charCodeAt(0)) {
        }
        lDeferred.resolve(letters);
    });

    this.getPeople = function () {
        return pDeferred.promise;
    };

    this.getLetters = function () {
        return lDeferred.promise;
    }
});

function KuenstlerinnenController($scope, $routeParams, Page, artists) {
    artists.getPeople().then(function (people) {
        $scope.people = people.map(function (person) {
          person.imageSize = intoRect({width: 120, height: 80}, person.images[0]);
            return person;
        });

        if ($routeParams.letter) {
            $scope.people = $scope.people.filter(function (person) {
                return utils.urlify(person.orderName.charAt(0)).toUpperCase() === $routeParams.letter;
            });
        }
    });

    $scope.curLetter = $routeParams.letter;

    Page.setTitle('Künstlerinnen' + ($routeParams.letter ? ' ' + $routeParams.letter : ''));
    Page.setSidebarContent('');
}

app.service('search', function (db, $q) {
    var fields = [ 'description', 'participants', 'sponsors', 'name', 'bio', 'title', 'by' ];
    var idx = lunr(function () {
        fields.forEach(this.field.bind(this));
    });
    var idxDeferred = $q.defer();
    db.promise.then(function () {
        [ db.Person, db.Event, db.Piece, db.Page ].forEach(function (c) {
          var objs = db.findObjects(c).map(function (obj) {
              obj = Object.create(obj);
              fields.forEach(function (f) {
                  obj[f] = removeTeaserMarker(translate(obj[f]));
              });
              return obj;
          });
          objs.forEach(idx.add.bind(idx));
        });
        idxDeferred.resolve(idx);
    });
    this.search = function (term) {
        var searchDeferred = $q.defer();
        idxDeferred.promise.then(function () {
            searchDeferred.resolve(idx.search(term));
        });
        return searchDeferred.promise;
    };
});

function SearchController($scope, $routeParams, search, db) {
    if (!$routeParams.term) {
        return;
    }
    $scope.term = $routeParams.term;

    search.search($routeParams.term).then(function (res) {
        res = res.map(function (r) {
            var obj = db.Extent.extent[r.ref];
            var prefix = '';
            if (obj instanceof db.Person) {
                prefix = '/person';
            } else if (obj instanceof db.Event) {
                prefix = '/veranstaltung';
            } else if (obj instanceof db.Piece) {
                prefix = '/stueck';
            }
            obj = {
                link: prefix + '/' + obj.link,
                name: translate(obj.name)
            };
            return obj;
        });
        $scope.results = res;
    });
}

function PageController($scope, $timeout, $location, Page, db) {
    // We inject the db in order to trigger db loading

    if (!Object.create) {
        window.location = '/browser-error';
    }

    $scope.Page = Page;

    $scope.scrollPos = {}; // scroll position of each view

    $(window).on('scroll', function() {
        if ($scope.okSaveScroll) { // false between $routeChangeStart and $routeChangeSuccess
            $scope.scrollPos[$location.path()] = $(window).scrollTop();
            console.log('save scroll position for', $location.path(), '=>', $scope.scrollPos[$location.path()]);
        }
    });

    $scope.scrollClear = function(path) {
        console.log('clear scroll position for', path);
        $scope.scrollPos[path] = 0;
    }

    $scope.$on('$routeChangeStart', function() {
        $scope.okSaveScroll = false;
    });

    $scope.$on('$routeChangeSuccess', function (e, newRoute) {
        $timeout(function() { // wait for DOM, then restore scroll position
            var position = $scope.scrollPos[$location.path()] ? $scope.scrollPos[$location.path()] : 0;
            console.log('restore scroll position for', $location.path(), '=>', position);
            $(window).scrollTop(position);
            $scope.okSaveScroll = true;
        }, 0);

        $scope.Page.currentMenuItem(newRoute.$route && newRoute.$route.activeMenuItem);
    });

}
app.factory('Page', function () {
    var title = '';
    var sidebar = null;
    var marginals = null;
    var curMenuItem;
    return {
        title: function() { return title; },
        setTitle: function(newTitle) { title = newTitle; },
        customSidebar: function () { return sidebar !== null && typeof sidebar !== 'undefined'},
        marginals: function (newContent) {
            if (arguments.length === 0) {
                return marginals;
            }
            sidebar = null; marginals = newContent;
        },
        sidebarContent: function () { return sidebar; },
        setSidebarContent: function (newSidebar) { sidebar = newSidebar; marginals = null},
        menuClass: function (item) { return item === curMenuItem ? 'active' : ''; },
        currentMenuItem: function (newCurMenuItem) { curMenuItem = newCurMenuItem; }
    };
});

function NewsletterController($scope, $http) {
    $scope.subscribe = function () {
        $scope.success = false;
        $http.post('/newsletter-subscription', {address: this.address}).success(function () {
            $scope.success = true;
        });
    };
};

function SearchFormController($scope, $location, $routeParams) {
    $scope.search = function () {
        $location.path('/suche/' + $scope.term);
        $scope.term = ''; // FIXME: This is just to be consistent
    };
};

app.config(function($locationProvider, $routeProvider) {

    $locationProvider.html5Mode(true);

    [ { name: 'repertoire', controller: RepertoireController, activeMenuItem: 'Programm' },
      { name: 'archiv', controller: ArchiveController, activeMenuItem: 'Programm' },
      { name: 'archiv/:date', controller: ArchiveController, activeMenuItem: 'Programm' },
      { name: 'archiv/:date/:category', controller: ArchiveController, activeMenuItem: 'Programm' },
      { name: 'spielplan', controller: ScheduleController, activeMenuItem: 'Programm' },
      { name: 'spielplan/:month', controller: ScheduleController, activeMenuItem: 'Programm' },
      { name: 'person/:personId', controller: PersonPageController, activeMenuItem: 'kuenstlerinnen' },
      { name: 'stueck/:pieceId', controller: PiecePageController, activeMenuItem: 'Programm' },
      { name: 'auffuehrung/:enactmentId', controller: EnactmentPageController, activeMenuItem: 'Programm' },
      { name: 'veranstaltung/:eventId', controller: EventPageController, activeMenuItem: 'Programm' },
      { name: 'kuenstlerinnen', controller: KuenstlerinnenController },
      { name: 'kuenstlerinnen/:letter', controller: KuenstlerinnenController, activeMenuItem: 'kuenstlerinnen' },
      { name: 'pressemitteilungen', controller: PressPdfController, activeMenuItem: 'Presse' },
      { name: 'bildmaterial', controller: PressImagesController, activeMenuItem: 'Presse' },
      { name: '', templateName: 'home', controller: HomeController },
      { name: 'suche/:term', controller: SearchController }
    ].forEach(function (pageDef) {
        pageDef.templateUrl = '/partials/' + (pageDef.templateName || pageDef.name.replace(/\/.*$/, "")) + '.html';
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
    .directive("pageTitle", function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/page-title.html'
        };
    })
    .directive("homeItem", function () {
        return {
            restrict: 'E',
            replace: true,
            scope: {item: '='},
            templateUrl: '/partials/home-item.html'
        };
    })
    .directive("artistsLetterList", function (artists) {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/artists-letter-list.html',
            scope: {cur: '='},
            link: function ($scope, element, attributes) {
                artists.getLetters().then(function (letters) {
                    $scope.letters = letters.slice();
                    $scope.letters.offset = letters.offset;

                    if ($scope.cur) {
                        $scope.letters[$scope.cur.charCodeAt(0)] += ' active';
                    }
                });
            }
        };
    })
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
                $scope.lang = language;
            }
        }
    })
    .directive("menuItem", [ '$location', function ($location) {
        return {
            restrict: 'E',
            replace: true,
            transclude: true,
            scope: true,
            template: '<li><a class="site-menuitem-{{lang}}-{{to}} ir" ng-class="Page.menuClass(to)" href="/{{to}}" ng-transclude></a></li>',
            link: function ($scope, element, attributes) {
                $scope.to = attributes.to || utils.urlify(element.text());
                $scope.lang = language;
            }
        };
    }])
    .directive("staticPage", function (db) {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/static-page.html',
            scope: {pageName: '='},
            link: function ($scope, element, attributes) {
                // pageName is only set in scope when it refers to something in
                // the parent scope.
                db.promise.then(function () {
                    $scope.page = db.get(db.Page, $scope.pageName || attributes.pageName);
                });
            }
        };
    })
    .directive("content", function ($compile, db) {
        return {
            restrict: 'E',
            replace: true,
            scope: true,
            link: function ($scope, element, attributes) {
                var pageName = window.location.pathname.substr(1);

                $scope.Page.setSidebarContent();
                $scope.Page.currentMenuItem({
                    'haus': 'Haus',
                    'geschichte': 'Haus',
                    'team': 'Haus',
                    'auszeichnungen': 'Haus',
                    'postmigranten_on_tour': 'Haus',
                    'partner': 'Haus',
                    'tickets': 'tickets',
                    'reihen': 'Programm'
                }[pageName]);

                db.promise.then(function () {
                    var page = db.get(db.Page, pageName);

                    var html;
                    if (page) {
                        $scope.Page.setTitle(page.name);
                        $scope.page = pageName;
                        html = '<static-page page-name="page"></static-page>';
                    } else if (pageName === 'english') {
                        $scope.Page.setTitle('English page');
                        html = '<p>We are working on the English version of our website, which will soon be available here.</p>';
                    } else {
                        $scope.Page.setTitle('Seite nicht gefunden');
                        html = '<p>Die Seite "' + pageName + '" wurde nicht gefunden</p>';
                    }
                    var contents = angular.element(html);
                    element.replaceWith(contents);
                    $compile(contents)($scope);
                    if (!$scope.$$phase) {
                        $scope.$apply();
                    }
                });
            }
        };
    })
    .directive("prices", function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/prices.html',
            scope: { 'for': '=' }
        };
    })
    .directive("pieceSidebar", function (db) {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/piece-sidebar.html',
            scope: { 'for': '=' },
            link: function ($scope, element, attributes) {
                db.promise.then(function () {
                    $scope.participants = peopleMatch(db, $scope.for.participants);
                });
            }
        };
    })
    .directive("homeSidebar", function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/home-sidebar.html',
            scope: { 'for': '=' }
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
            scope: { 'for': '=' }
        };
    })
    .directive("thumbnail", function () {
        return {
            restrict: 'E',
            replace: true,
            template: ' <img ng-src="/image/{{for.images[0].name}}?thumbnail=1" width="{{for.imageSize.width}}" height="{{for.imageSize.height}}" />',
            scope: { 'for': '=' }
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
    .directive("backendImage", function () {
        return {
            restrict: 'E',
            replace: true,
            template: '<img ng-show="image" ng-src="/image/{{image.name}}" width="{{image.width}}" height="{{image.height}}" />',
            scope: { image: '=' }
        };
    })
    .directive("mediaBrowser", function () {
        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/partials/media-browser.html',
            scope: { model: '=' },
            link: function ($scope, element, attributes) {
                var maxWidth = 630;
                var maxHeight = 400;
                var maxVideoHeight = 376;

                $scope.media = ($scope.model && $scope.model.images || []).slice();

                $scope.media = $scope.media.map(function (picture) {
                    picture = intoRect({width: maxWidth, height: maxHeight}, picture);
                    picture.type = 'picture';
                    return picture;
                });

                if ($scope.model && $scope.model.video) {
                    $scope.model.video.type = 'video';
                    $scope.model.video.vimeoId = $scope.model.video.vimeoId || $scope.model.video.url.match(/\/(\d+)$/)[1];
                    $scope.model.video.width = maxWidth;
                    $scope.model.video.height = maxVideoHeight;
                    $scope.media.push($scope.model.video);
                }

                $scope.mediumIndex = 0;

                $scope.clickMedium = function () {
                    $scope.mediumIndex = this.$index;
                };

                $scope.gotoMedium = function (direction) {
                    $scope.mediumIndex = ($scope.mediumIndex + direction + $scope.media.length) % $scope.media.length;
                };
            }
        }
    });
