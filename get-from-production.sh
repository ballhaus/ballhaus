#!/bin/sh

site=$1

if [ "$site" = "" ]
then
    site=ballhaus
fi

rsync -av "ballhaus.netzhansa.com:~ballhaus/$site/{ballhaus.dat,thumbnails,images}" .
