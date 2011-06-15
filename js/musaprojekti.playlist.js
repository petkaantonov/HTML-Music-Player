var playlist = playlist || {};

playlist.itemHeight = 15;
//  JSON Schema to validate playlist input
playlist.schema = {
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
	};

// Factory to create in place sorter functions
playlist.createSorter = function createSorter( targetArray, sortFunc, sortArgs, returnvalue, context ) {

context = context || null;
	return function( songs ) {
	var i, selection = context._selection, l = selection.length, song;
		if( !songs || songs.length < 2 ) {
		return;
		}
	songs[ sortFunc ].apply( songs, sortArgs );
		for( i = 0; i < l; ++i ) {
		song = songs[i];
		targetArray[ selection[i] ] = song;
		}
	return returnvalue || false;
	};
};

playlist.menu = new ActionMenu( "playlist-action-menu", {
	selector: ".app-action-tab",
	disabledClass: "app-action-disabled",
	name: "playlist"
}).disable( "all" );


playlist.songDisplay = new SongDisplay( "app-song-display" );
playlist.selections = new Selectable( "playlist", ".app-song", {activeClass: "app-song-active"} );
playlist.main = new Playlist( playlist.selections, {songList: [{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 320},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com", pTime: 179},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"},{name: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis iaculis elit imperdiet dolor mollis ultricies pharetra orci commodo. Sed non ante ligula, vel tincidunt urna. Nulla sit amet metus urna, euismod ultrices nulla. Nunc eu nisi elit. Vivamus odio nunc, eleifend ut sagittis eu, imperdiet quis turpis. Phasellus placerat tortor non odio metus.", url: "to.com"}]} );
playlist.dragging = new DraggableSelection( "playlist", playlist.selections, playlist.main, playlist.itemHeight, ".app-song-container" );

playlist.getTotalTime = function( arr ){
var tTime = 0, i, l = arr.length, time;

	for( i = 0; i < l; ++i ) {
	time = arr[i].pTime || 0;
	tTime += time;
	}
return tTime && util.toTimeString( tTime ) || "N/A";
}
playlist.saver = new Saver( "PlaylistJSON", storage, {exportURL: "ajax/exportJSON.php" });
playlist.loader = new Loader( "PlaylistJSON", storage );

playlist.loader.onload = function( resp ) {
var valid, key, name = resp && resp.name || "";
	if( resp && typeof resp.data == "object" && resp.data.constructor !== Array ) {
	 	for( key in resp.data ) {
	 	name = key;
	 	resp.data = resp.data[key];
	 	}
	
	}

	if( !resp.error ) {
	valid = JSONSchema.validate( resp.data, playlist.schema );
		if( valid.valid ) {
		
			if( !popup.length ) {
			popup.open( "", 500, 50 );
			}
		
			$( popup.html( '<table style="height:90%;"><tbody><tr><td><h2 class="app-header-2 centered">Loading</h2></td></tr></tbody></table>') ).fadeOut( 700, function(){
			popup.closeAll();
			playlist.main.add( resp.data );
			});
		return true;
		} else {
		resp.error = "Invalid playlist format";
		}
	}
popup.open( '<h2 style="font-size:14px;" class="app-error app-header-2 centered">'+resp.error+'</h2>', 500, 50 );
}

playlist.saver.onexport = function( resp ) {
appSetData( "playlistName", resp.name );
appSetData( "saveMethod", "file" );
	if( !resp.error) {
	window.document.location = resp.url;
	popup.closeAll();
	return;
	}
popup.open( '<h2 style="font-size:14px;" class="app-error app-header-2 centered">'+resp.error+'</h2>', 500, 50 );
};

playlist.saver.onsave = function( resp ) {
appSetData( "playlistName", resp.name );
appSetData( "saveMethod", "mem" );

	if( !resp.error ) {
		if(!popup.length ) {
		popup.open("",500,50);
		}
		$( popup.html( '<table style="height:90%;"><tbody><tr><td>'+
				'<h2 class="app-header-2 centered">Saved</h2></td></tr></tbody></table>') ).fadeOut( 1200, function(){
		popup.closeAll();
		});
		
	return;
	}

popup.open( '<h2 style="font-size:14px;" class="app-error app-header-2 centered">'+resp.error+'</h2>', 500, 50 );
};

// These methods get an array of song hashes in the current user selection as argument

playlist.menu.orderedActions = {
	"0":	function( songs ) {
		playlist.main.changeSong( songs[0] );
	},
	"1":	function( songs ) {
		download.main( songs[0] );
	},
	"2":	function( songs ) {
		playlist.main.remove( songs );
	},
	"3":	function( songs ) {
	var lastHash = songs[songs.length-1],
		lastItem = playlist.main.getPositionByHash( lastHash );
		playlist.main.add( playlist.main.getSongByHash( songs ), lastItem+1 );
	},
	
	"4":	playlist.createSorter( playlist.main._hashList, "reverse", [], false, playlist.selections ),

	"5":	playlist.createSorter( playlist.main._hashList, "sort", [SORT_ALPHA_ASC( playlist.main["_songList" ], "name" )], false, playlist.selections ),
	
	"6":	playlist.createSorter( playlist.main._hashList, "shuffle", [], false, playlist.selections )
		
};

playlist.menu.onmenuclick = function( menuID ) {
playlist.selections.applyTo( playlist.main.getContainer(), playlist.menu.orderedActions[ menuID ] );
	
	if( menuID == 2 ) {
	playlist.selections.clearSelection();
	}
	else if( menuID >= 4 ) {
	playlist.main.render();
	}
};

playlist.main.onadd =function( count ) {
animateChanges({color: POSITIVE, count: "+"+count, start: PLAYLIST_CHANGES_START, end: PLAYLIST_POSITIVE_END});
};

playlist.main.onremove = function( count ) {
animateChanges({color: NEGATIVE, count: "-"+count, start: PLAYLIST_CHANGES_START, end: PLAYLIST_NEGATIVE_END});
};



playlist.selections.onselect = function( selection ) {
updateSelection( selection && selection.length || 0 );
	if( selection && selection.length ) {
	playlist.menu.enable( "all" );
	}
	else {
	playlist.menu.disable( "all" );
	}
};

playlist.selections.onscroll = function( node ) {
filter.scrollIntoView( node.parentNode, node.parentNode.parentNode );
};

playlist.main.onupdate = function( songList, hashList, curSongHash, selections ){
var song, i, songTimeFormatted,
	l = hashList.length, str = [], hash, curh = 0, songIdx = -1, songObj;

selections.sort( SORT_NUMBER_ASC );

	for( i = 0; i < l; ++i ) {
	hash = hashList[ i ];
	song = songList[ hash ];
	
	songTimeFormatted = song.pTimeFmt || ( song.pTime && util.toTimeString( song.pTime ) ) || "";
	song.pTimeFmt = songTimeFormatted;
	
		if( hash === curSongHash ) {
		songIdx = i;
		songObj = song;
		
		}
	
	str.push( 	"<div class=\"app-song-container\" style=\"position: absolute;top:"+( playlist.itemHeight * i )+"px;\">",
			"<div id=\"app-song-"+i+"\" class=\"app-song",
			hash === curSongHash ? " app-playing" : "",
			selections.bSearch( i ) > -1 ? " app-song-active" : "",
			"\"><span class=\"app-song-name notextflow\">"+( i + 1 )+". " + song.name.htmlEncode() + "</span>",
			"<span class=\"app-song-time\">" + songTimeFormatted + "</span>",
			"</div></div>" );
	
	}


$( "#playlist" ).html( str.join( "" ) );
playlist.main.onchange.call( playlist, songObj, songIdx );
};

playlist.main.onchange = function( songObj, songIdx ) {
	if( songIdx < 0 )
	return;
	
$( ".app-playing", document.getElementById("playlist") ).removeClass( "app-playing" );
$( "#app-song-"+songIdx ).addClass( "app-playing" );
playlist.songDisplay.newTitle( "" + ( songIdx + 1 ) + ". " + songObj.name ).beginMarquee();
};

$( "#playlist" ).delegate( ".app-song", "dblclick", function(e) {
var id = this.id, hash;
hash = playlist.main.getHashByIndex( +( id.substr( id.lastIndexOf( "-" ) + 1 ) ) );
playlist.main.changeSong( hash );
});

$( "#skipbut" ).click( function() {
playlist.main.next();
});

$( "#prevbut" ).click( function() {
playlist.main.prev();
});

playlist.main.render();