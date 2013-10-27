var system = require('system');
var fs = require('fs');
var webpage = require('webpage');

var base_url = system.args[1] || 'http://localhost:3000';

console.log('base url', base_url);
var page = webpage.create();

page.onConsoleMessage = function printConsole(msg) {
    system.stderr.writeLine('console: ' + msg);
}

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

var currentPath = '/';
function nextUrl() {
    if (pathsToLoad.length) {
        currentPath = pathsToLoad.pop();
        gotoPath(currentPath);
    } else {
        phantom.exit();
    }
}

function savePage() {
    var directory = 'crawled/' + currentPath.replace(/(.*)\/.*$/, "$1");
    var filename = currentPath.replace(/.*\/(.*)$/, "$1");
    if (filename == '') {
        filename = 'index';
    }
    filename += '.html';
    fs.makeTree(directory);
    fs.write(directory + '/' + filename, page.content, 'w');
}

page.onCallback = function (message) {
    console.log('got phantom message', message.type);
    switch (message.type) {
    case 'dbLoaded':
    case 'pageLoaded':
        savePage();
        getUrlsToLoad();
        nextUrl();
    }
}

page.open(base_url + '/');
