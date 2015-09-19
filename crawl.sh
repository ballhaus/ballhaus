#!/bin/sh

set -e

cd $HOME/ballhaus
phantomjs crawl.js http://ballhausnaunynstrasse.de/ 2>&1
exec rsync -av crawled ballhaus@ballhaus:ballhaus
