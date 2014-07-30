#!/bin/sh

if which -s gm
then
    :
else
    echo "please install graphicsmagick!"
    exit 1
fi

if [ ! -f public/js/config.js ]
then
    echo "missing link to public/js/config.js"
    exit 1
fi

if [ ! -f config.json ]
then
    echo "missing config.json"
    exit 1
fi

while true
do
	node app
	sleep 3
done
