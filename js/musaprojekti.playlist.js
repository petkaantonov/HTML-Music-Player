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
playlist.main = new Playlist( playlist.selections, {songList: [{"url":"http://149.5.240.22/WR-FI-finland","name":"NRJ Finland","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=10"},{"url":"http://149.5.240.21/WR-FI-WR10","name":"NRJ Suomihitit","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=5632452377"},{"url":"http://149.5.240.21/WR-FI-WR12","name":"NRJ Live","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=1293381027"},{"url":"http://149.5.240.21/WR-FI-HIPHOP","name":"NRJ Hip Hop","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=1907644740"},{"url":"http://149.5.240.21/WR-FI-RNB","name":"NRJ R 'n' B","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=850377837"},{"url":"http://149.5.240.21/WR-FI-POP","name":"NRJ Pop","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=1781596043"},{"url":"http://149.5.240.21/WR-FI-HIT","name":"NRJ Hot","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=1072168283"},{"url":"http://149.5.240.21/WR-FI-DANCE","name":"NRJ Dance","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=138080853"},{"url":"http://149.5.240.21/WR-FI-ROCK","name":"NRJ Rock","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=612578376"},{"url":"http://149.5.240.21/WR-FI-WR7","name":"NRJ Lounge","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=1120309038"},{"url":"http://149.5.240.21/WR-FI-WR8","name":"NRJ Mastermix","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=1947139847"},{"url":"http://149.5.240.21/WR-FI-WR9","name":"NRJ Special","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=1332572254"},{"url":"http://149.5.240.21/WR-FI-WR11","name":"NRJ Love","trackinfo":"http://wr.nrj.net/xml/?q=rtmp&id=1378634725"},{"url":"http://striimi.radionova.fi/radionova/fi/rock.mp3","name":"Radio Nova Rock","trackinfo":"http://media.radionova.fi/novaselain/getPlayInfo.php?radio=rock"},{"url":"http://striimi.radionova.fi/radionova/fi/radionova_on_air.mp3","name":"Radio Nova On Air","trackinfo":"http://media.radionova.fi/novaselain/getPlayInfo.php?radio=onair"},{"url":"http://striimi.radionova.fi/radionova/fi/radio_helmi.mp3","name":"Radio Nova Helmi","trackinfo":"http://media.radionova.fi/novaselain/getPlayInfo.php?radio=helmi"},{"url":"http://striimi.radionova.fi/radionova/fi/Kotimainen.mp3","name":"Radio Nova Kotimainen","trackinfo":"http://media.radionova.fi/novaselain/getPlayInfo.php?radio=kotimainen"},{"url":"http://striimi.radionova.fi/radionova/fi/uutuus.mp3","name":"Radio Nova Uutuus","trackinfo":"http://media.radionova.fi/novaselain/getPlayInfo.php?radio=uutuus"},{"name":"Trance.FM 192 kbps","url":"http://nl01.audio.trance.fm/tc/192","trackinfo":"www.trance.fm/tfm_v600/xml/currentsong.xml"},{"name":"DI.FM Techno","url":"http://88.191.102.29:7204/"},{"name":"DI.FM Trance","url":"http://scfire-dtc-aa01.stream.aol.com:80/stream/1003"},{"name":"DI.FM Vocal Trance","url":"http://scfire-dtc-aa01.stream.aol.com:80/stream/1065"},{"name":"DI.FM Chillout","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1035"},{"name":"DI.FM House","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1007"},{"name":"DI.FM EuroDance","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1024"},{"name":"DI.FM Hard Dance","url":"http://209.247.146.98:8000/"},{"name":"DI.FM Progressive","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1026"},{"name":"DI.FM Goa-Psy Trance","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1008"},{"name":"DI.FM Hardcore","url":"http://88.191.122.121:80/"},{"name":"DI.FM DJ Mixes","url":"http://209.247.146.100:8000/"},{"name":"DI.FM Lounge","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1009"},{"name":"DI.FM Ambient","url":"http://205.188.215.228:8006/"},{"name":"DI.FM Drum 'n Bass","url":"http://207.200.96.229:8030/"},{"name":"DI.FM Classic Electronica","url":"http://205.188.215.225:8004/"},{"name":"DI.FM Breaks","url":"http://205.188.215.225:8002/"},{"name":"DI.FM Gabber","url":"http://205.188.215.226:8006/"},{"name":"DI.FM Mostly Classical","url":"http://scfire-dtc-aa01.stream.aol.com:80/stream/1006"},{"name":"DI.FM New Age","url":"http://scfire-dtc-aa01.stream.aol.com:80/stream/1002"},{"name":"DI.FM World","url":"http://173.192.50.13:6674/"},{"name":"DI.FM Classical Guitar","url":"http://205.188.215.226:8020/"},{"name":"DI.FM Top Hits","url":"http://scfire-dtc-aa01.stream.aol.com:80/stream/1014"},{"name":"DI.FM Smooth Jazz","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1010"},{"name":"DI.FM Uptempo Smooth Jazz","url":"http://87.98.169.195:8000/"},{"name":"DI.FM Urban Jamz","url":"http://80.94.69.106:6704/"},{"name":"DI.FM Best of the 80's","url":"http://scfire-dtc-aa03.stream.aol.com:80/stream/1013"},{"name":"DI.FM Roots Reggae","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1017"},{"name":"DI.FM Classic Rap","url":"http://173.192.50.13:6694/"},{"name":"DI.FM Hit 70's","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1076"},{"name":"DI.FM Oldies","url":"http://91.121.35.252:8000/"},{"name":"DI.FM Country","url":"http://scfire-dtc-aa01.stream.aol.com:80/stream/1019"},{"name":"DI.FM Jazz Classics","url":"http://205.188.215.227:8008/"},{"name":"DI.FM Salsa","url":"http://205.188.215.231:8010/"},{"name":"DI.FM Soulful House","url":"http://205.188.215.232:8016/"},{"name":"DI.FM DaTempo Lounge","url":"http://scfire-dtc-aa03.stream.aol.com:80/stream/2012"},{"name":"DI.FM Classic Rock","url":"http://80.94.69.106:6734/"},{"name":"DI.FM Alt Rock","url":"http://88.191.122.121:6754/"},{"name":"DI.FM Indie Rock","url":"http://67.21.210.110:8010/"},{"name":"DI.FM Future Synthpop","url":"http://80.94.69.106:6234/"},{"name":"DI.FM Simply Soundtracks","url":"http://80.94.69.106:6774/"},{"name":"DI.FM Contemporary Christian","url":"http://80.94.69.106:6784/"},{"name":"DI.FM Solo Piano","url":"http://scfire-dtc-aa03.stream.aol.com:80/stream/1004"},{"name":"DI.FM Piano Jazz","url":"http://88.191.122.121:6814/"},{"name":"DI.FM Bossa Nova","url":"http://80.94.69.106:6806/"},{"name":"DI.FM Minimal","url":"http://94.23.3.33:4100/"},{"name":"DI.FM Hardstyle","url":"http://195.43.138.146:8000/"},{"name":"DI.FM Electro House","url":"http://scfire-dtc-aa01.stream.aol.com:80/stream/1025"},{"name":"DI.FM A Beatles Tribute","url":"http://67.21.210.110:8012/"},{"name":"DI.FM Love Music","url":"http://di.santrex.net:8002/"},{"name":"DI.FM Funky House","url":"http://88.191.122.121:6284/"},{"name":"DI.FM Tribal House","url":"http://173.192.50.13:6274/"},{"name":"DI.FM Exposure NYC","url":"http://80.94.69.106:6294/"},{"name":"DI.FM Space Music","url":"http://80.94.69.106:6304/"},{"name":"DI.FM Tech House","url":"http://88.191.102.29:6354/"},{"name":"DI.FM Psychill","url":"http://67.21.210.110:8008/"},{"name":"DI.FM Chillout Dreams","url":"http://195.43.138.147:8000/"},{"name":"DI.FM Classic EuroDance","url":"http://173.192.50.13:6324/"},{"name":"DI.FM Club Sounds","url":"http://67.21.210.110:8004/"},{"name":"DI.FM Bebop Jazz","url":"http://u15c.sky.fm:80/sky_bebop"},{"name":"DI.FM Disco House","url":"http://88.191.102.29:6384/"},{"name":"DI.FM Dubstep","url":"http://67.21.210.110:8002/"},{"name":"DI.FM Classic Trance","url":"http://67.21.210.110:8000/"},{"name":"DI.FM Liquid DnB","url":"http://88.191.102.29:6404/"},{"name":"DI.FM Oldschool House","url":"http://u14.di.fm:80/di_oldschoolhouse"},{"name":"DI.FM Chiptunes","url":"http://u15c.di.fm:80/di_chiptunes"},{"name":"DI.FM Liquid DnB","url":"http://88.191.102.29:6404/"},{"name":"DI.FM Oldschool House","url":"http://u14.di.fm:80/di_oldschoolhouse"},{"name":"DI.FM Chiptunes","url":"http://u15c.di.fm:80/di_chiptunes"},{"name":"DI.FM Trance","url":"http://scfire-dtc-aa01.stream.aol.com:80/stream/1003"},{"name":"DI.FM Vocal Trance","url":"http://scfire-dtc-aa01.stream.aol.com:80/stream/1065"},{"name":"DI.FM Tech House","url":"http://88.191.102.29:6354/"},{"name":"DI.FM Psychill","url":"http://67.21.210.110:8008/"},{"name":"DI.FM Chillout Dreams","url":"http://195.43.138.147:8000/"},{"name":"DI.FM EuroDance","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1024"},{"name":"DI.FM Club Sounds","url":"http://67.21.210.110:8004/"},{"name":"DI.FM Electro House","url":"http://scfire-dtc-aa01.stream.aol.com:80/stream/1025"},{"name":"DI.FM House","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1007"},{"name":"DI.FM Soulful House","url":"http://205.188.215.232:8016/"},{"name":"DI.FM Classic EuroDance","url":"http://173.192.50.13:6324/"},{"name":"DI.FM Progressive","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1026"},{"name":"DI.FM Chillout","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1035"},{"name":"DI.FM Lounge","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1009"},{"name":"DI.FM Disco House","url":"http://88.191.102.29:6384/"},{"name":"DI.FM Dubstep","url":"http://67.21.210.110:8002/"},{"name":"DI.FM Classic Trance","url":"http://67.21.210.110:8000/"},{"name":"DI.FM Ambient","url":"http://205.188.215.228:8006/"},{"name":"DI.FM Goa-Psy Trance","url":"http://scfire-dtc-aa06.stream.aol.com:80/stream/1008"},{"name":"DI.FM Minimal","url":"http://94.23.3.33:4100/"},{"name":"DI.FM Drum 'n Bass","url":"http://207.200.96.229:8030/"},{"name":"DI.FM Techno","url":"http://88.191.102.29:7204/"},{"name":"DI.FM Hardcore","url":"http://88.191.122.121:80/"},{"name":"DI.FM Hardstyle","url":"http://195.43.138.146:8000/"},{"name":"DI.FM Exposure NYC","url":"http://80.94.69.106:6294/"},{"name":"DI.FM Funky House","url":"http://88.191.122.121:6284/"},{"name":"DI.FM Tribal House","url":"http://173.192.50.13:6274/"},{"name":"DI.FM Hard Dance","url":"http://209.247.146.98:8000/"},{"name":"DI.FM Space Music","url":"http://80.94.69.106:6304/"},{"name":"DI.FM DJ Mixes","url":"http://209.247.146.100:8000/"},{"name":"DI.FM Classic Electronica","url":"http://205.188.215.225:8004/"},{"name":"DI.FM Breaks","url":"http://205.188.215.225:8002/"},{"name":"DI.FM Future Synthpop","url":"http://80.94.69.106:6234/"},{"name":"DI.FM Gabber","url":"http://205.188.215.226:8006/"}]} );
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
util.scrollIntoView.alignMiddle( node.parentNode, node.parentNode.parentNode );
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