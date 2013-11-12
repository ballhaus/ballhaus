var system = require('system');
var fs = require('fs');
var webpage = require('webpage');

var base_url = system.args[1] || 'http://localhost:3000';

console.log('base url', base_url);
var page = webpage.create();
var sitemap = '';

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
        fs.write('public/sitemap.xml',
                 '<?xml version="1.0" encoding="UTF-8"?>\n'
                 + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n'
                 + sitemap
                 + '</urlset>\n',
                 'w');
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
    console.log('wrote', directory + '/' + filename);
    sitemap += '<url>\n  <loc>http://ballhausnaunynstrasse.de/' + currentPath.replace(/^\//, "") + '</loc>\n';
    var images
        = page.evaluate(function () {
            return $('img').map(function (_, img) { return img.src; });
        });
    for (var i = 0; i < images.length; i++) {
        if (!images[i].match(/header.png$/) && images[i].match(/\.(jpe?g|png)$/)) {
            sitemap += '  <image:image><image:loc>' + images[i] + '</image:loc></image:image>\n';
        }
    }
    sitemap += '</url>\n';
}

page.onCallback = function (message) {
    console.log('got phantom message', message.type);
    switch (message.type) {
    case 'dbLoaded':
        console.log('database loaded in client');
        break;
    case 'pageLoaded':
        savePage();
        getUrlsToLoad();
        nextUrl();
    }
}

page.open(base_url + '/');
