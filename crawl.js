//PhantomJS http://phantomjs.org/ based web crawler Anton Ivanov anton.al.ivanov@gmail.com 2012
 
function Crawler(base_url) {
    this.visitedURLs = {};
    this.base_url = base_url;
};

Crawler.webpage = require('webpage');

Crawler.prototype.crawl = function (url, depth, onSuccess, onFailure) {
    if (depth == 0 || this.visitedURLs[url]) {
        return;
    };
    var self = this;
    var page = Crawler.webpage.create();
    
    page.open(this.base_url + url, function (status) {
        if (status == 'fail') { 
            onFailure({
                url: url, 
                status: status
            });
        } else {
            var documentHTML = page.evaluate(function () {
                return document.body && document.body.innerHTML ? document.body.innerHTML : "";
            });
            console.log('crawl', url);
            self.crawlURLs(self.getAllURLs(page), depth - 1, onSuccess, onFailure);
            self.visitedURLs[url] = true;
            onSuccess({
                url: url,
                status: status,
                content: documentHTML
            });
        };
    });
};

Crawler.prototype.getAllURLs = function(page) {
    return page.evaluate(function () {
        return Array.prototype.slice.call(document.querySelectorAll("a"), 0)
            .map(function (link) {
                return link.getAttribute("href");
            });
    })
        .filter(function (url) {
            return !url.match(/^http/);
        });
};

Crawler.prototype.crawlURLs = function(urls, depth, onSuccess, onFailure) {
    var self = this;
    urls.forEach(function (url) {
        self.crawl(url, depth, onSuccess, onFailure);
    });
};

new Crawler("http://localhost:3000").crawl("/", 2, 
    function onSuccess(page) {
        console.log("Loaded page. URL = " + page.url + " content length = " + page.content.length + " status = " + page.status);
    }, 
    function onFailure(page) {
        console.log("Could not load page. URL = " +  page.url + " status = " + page.status);
    }
);

