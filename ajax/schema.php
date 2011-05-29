<?php
$schema = '{
		"description" : "Array of playlist song objects",
		"type" : "array",
		"minItems" : 1,
		"items" : {
			"title" : "playlist song object",
			"type" : "object",
			"properties" : {
			"url" : {
				"type" : "string",
				"title" : "URL of the song"
				},
			"name" : {
				"type" : "string",
				"title" : "Name of the song"
				},
			"pTime" : {
				"type" : "integer",
				"title" : "playtime of the song in seconds",
				"optional" : true
				},
			"pTimeFmt" : {
				"type" : "string",
				"title" : "formatted playtime of the song",
				"optional" : true
				}
			}
		}
	}';


?>