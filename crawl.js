var system = require('system');

function printConsole(msg) {
    system.stderr.writeLine('console: ' + msg);
};

var page = require('webpage').create();

page.onConsoleMessage = printConsole;

var base_url = 'http://localhost:3000';

function gotoPath(path) {
    console.log('gotoPath', path);
    page.evaluate(function (path) {
        phantomGotoUrl(path);
    }, path);
}

var pathsToLoad = [];
var pathsScheduled = { '/': true };

function getAllURLs() {
    return page
        .evaluate(function () {
            return Array.prototype.slice.call(document.querySelectorAll("a"), 0)
                .map(function (link) {
                    return link.getAttribute("href");
                });
        })
        .filter(function (url) {
            return (!url.match(/[:]/) || url.match(base_url))
                && !url.match(/(#|\.pdf$)/)                 // avoid non-crawlable urls
                && !url.match(/kuenstlerinnen\//)           // avoid bug in letter list
                && url != '';
        })
        .map(function (url) {
            return url.replace(base_url, "");
        });
};

function getUrlsToLoad() {
    getAllURLs().forEach(function (url) {
        if (!pathsScheduled[url]) {
            console.log('add url', url);
            pathsScheduled[url] = true;
            pathsToLoad.push(url);
        }
    });
}

function nextUrl() {
    if (pathsToLoad.length) {
        gotoPath(pathsToLoad.pop());
    } else {
        phantom.exit();
    }
}

page.onCallback = function (message) {
    console.log('got phantom message', message.type);
    switch (message.type) {
    case 'dbLoaded':
    case 'pageLoaded':
        getUrlsToLoad();
        nextUrl();
    }
}

page.open(base_url + '/');
