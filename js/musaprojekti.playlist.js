var playlist = playlist || {};

playlist.itemHeight = 15;

playlist.STORAGE_IDENTIFIER = "PlaylistJSON";

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
}).activate( "none" );

playlist.defaultList = [];
	(function(){
	var strage = window.storage.get( playlist.STORAGE_IDENTIFIER ) || null;
	
		if( strage && strage["AutoSave"] ) {
		playlist.defaultList = strage.AutoSave;
		}
		
	})();

playlist.songDisplay = new SongDisplay( "app-song-display" );
playlist.selections = new Selectable( "app-playlist-container", ".app-song", {activeClass: "app-song-active"} );
playlist.main = new Playlist( playlist.selections, {songList: playlist.defaultList, itemHeight: playlist.itemHeight } );
playlist.dragging = new DraggableSelection( "app-playlist-container", playlist.selections, playlist.main, playlist.itemHeight, ".app-song-container" );

playlist.getTotalTime = function( arr ){
var tTime = 0, i, l = arr.length, time;

	for( i = 0; i < l; ++i ) {
	time = arr[i].pTime || 0;
	time = parseInt( time, 10 );
	tTime += time;
	}
console.log( tTime );
return tTime && util.toTimeString( tTime ) || "N/A";
}
playlist.saver = new Saver( playlist.STORAGE_IDENTIFIER, storage, {exportURL: "ajax/exportJSON.php" });
playlist.loader = new Loader( playlist.STORAGE_IDENTIFIER, storage );

playlist.loader.onload = function( resp, override ) {
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
		
			$( popup.html( '<table style="height:90%;"><tbody><tr><td><h2 class="app-info-status-text">Loading</h2></td></tr></tbody></table>') ).fadeOut( 700, function(){
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
				'<h2 class="app-info-status-text">Saved</h2></td></tr></tbody></table>') ).fadeOut( 1200, function(){
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
var l = selection && selection.length || 0;
updateSelection( l );

	if( !l ) {
	playlist.menu.activate( "none" );
	}
	else if ( l === 1 ) 
	playlist.menu.activate( [0, 1, 2, 3] );
	else {
	playlist.menu.activate( "all" );	
	}
};

playlist.selections.onscroll = function( node ) {
util.scrollIntoView.alignMiddle( node.parentNode, node.parentNode.parentNode );
};

playlist.main.onupdate = function( songList, hashList, curSongHash, selections ){
var song, i, songTimeFormatted,
	l = hashList.length, str = [], hash, curh = 0, songIdx = -1, songObj, hHash;

selections.sort( SORT_NUMBER_ASC );

	if( !l ) {
	str.push( "<div id=\"playlist-empty\" class=\"app-info-status-text\"><span id=\"playlist-empty-hover\">[ Playlist empty ]</span></div>" );
	}

	for( i = 0; i < l; ++i ) {
	hash = hashList[ i ];
	song = songList[ hash ];
	
	songTimeFormatted = song.pTimeFmt || ( song.pTime && util.toTimeString( song.pTime ) ) || "";
	song.pTimeFmt = songTimeFormatted;
	
		if( hash === curSongHash ) {
		songIdx = i;
		songObj = song;
		hHash = hash;
		
		}
	
	str.push( 	"<div class=\"app-song-container\" style=\"position: absolute;top:"+( playlist.itemHeight * i )+"px;\">",
			"<div id=\"app-song-"+i+"\" class=\"app-song",
			hash === curSongHash ? " app-playing" : "",
			selections.bSearch( i ) > -1 ? " app-song-active" : "",
			"\"><span class=\"app-song-name notextflow\">"+( i + 1 )+". " + song.name.htmlEncode() + "</span>",
			"<span class=\"app-song-time\">" + songTimeFormatted + "</span>",
			"</div></div>" );
	
	}


$( "#app-playlist-container" ).html( str.join( "" ) );
playlist.main.onchange.call( playlist, songObj, songIdx, hHash );
};

playlist.main.onchange = function( songObj, songIdx, hash ) {
	if( songIdx < 0 )
	return;
	
	if( window.File && songObj.url.constructor === File &&
		!songObj.parsed ) {
	songObj.hash = hash;
	localFiles.id3process.placeQueue( [songObj] );	
	}
	
	

$( ".app-playing", document.getElementById("app-playlist-container") ).removeClass( "app-playing" );
$( "#app-song-"+songIdx ).addClass( "app-playing" );
playlist.songDisplay.newTitle( "" + ( songIdx + 1 ) + ". " + songObj.name ).beginMarquee();
};



( function (){
var pushingHash = false;

playlist.main.onhistory = function( songObj, hash, historyIndex){
	if( window.history && window.history.pushState ) {
	history.pushState({index: historyIndex}, "", "?h="+historyIndex+"-"+hash);	
	}
	else {
	window.document.location = "#?h="+historyIndex+"-"+hash;
	pushingHash = true; // Prevent onhashchange trigger
	}
};

	if( window.history && window.history.pushState ) {

		window.onpopstate = function( e ){
		
			if( e.state && e.state.index != null ) {
			playlist.main.changeSongFromHistory( e.state.index );
			}
		};

	} else {
		$( window ).bind( "hashchange",
			function(){
				if( pushingHash ) { // Don't trigger this when we are entering new hashes..
				pushingHash = false;
				return;
				}
			var hash = window.document.location.hash;
				if( hash ) {
				var hashsong = hash.match( /#\?h=([0-9]+)-([0-9]+)/ );
					if( hashsong && hashsong[1] ) {
					playlist.main.changeSongFromHistory( hashsong[1] );
					}
			
			}
		});
	
	}
}())

$( "#app-playlist-container" ).delegate( ".app-song", "dblclick", function(e) {
var id = this.id, hash;
hash = playlist.main.getHashByIndex( +( id.substr( id.lastIndexOf( "-" ) + 1 ) ) );
playlist.main.changeSong( hash );
});

playlist.main.render();

	if( window.features.localStorage ) {
		jQuery( window ).bind( "beforeunload",
			function(e){
			playlist.saver.save( "AutoSave", playlist.main.toArray(), true );
			}
		);
	}