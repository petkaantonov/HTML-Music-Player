var localFiles = new LocalFiles( features.allowTypes, ["json", "ogg", "wav"] );

localFiles.BOM = /[\x00\x01\xFE\xFF]+/g;

localFiles.id3process = new ID3Process();

localFiles.id3process.ontagdata = function( obj ) {
var obj2 = {}, elm, time = "", name = "", pos;
	
	obj2.parsed = true;

	if( obj.artist && obj.title ) {
	name = ( obj.artist + " - " + obj.title ).replace( localFiles.BOM, "");
	obj2.name = name;
	}
	
	if( obj.pTime ) {
	time = util.toTimeString( obj.pTime );
	obj2.pTimeFmt = time;
	obj2.pTime = obj.pTime;
	}
	
playlist.main.modifySongByHash( obj.hash, obj2 );
pos = playlist.main.getPositionByHash( obj.hash );
elm = document.getElementById("app-song-"+pos );
	if( elm != null ) {
	name ? $( ".app-song-name", elm ).text( (1+pos)+". "+name ) : $.noop;
	$( ".app-song-time", elm ).text( time );
	}
};



localFiles.container = [];

localFiles.onvalidfile = function( file, mime, ext ) {
	if( ext != "json" ) {
	localFiles.container.push( {name: file.name, url: file, parsed: false} );
	}
	else {
	playlist.loader["import"]( file );
	}
};

localFiles.oncomplete = function( length ) {
$("#file-folder-input").removeFiles();
	if( localFiles.container.length ) {
	playlist.main.add( localFiles.container );
	localFiles.id3process.placeQueue( playlist.main.getVisibleSongs() );
	}
localFiles.container = [];
};

if( features.readFiles ) {
	$( "#app-playlist-container" ).bind( "scroll",
		throttle( function(){
		var songs = playlist.main.getVisibleSongs();
			if( songs.length ) {
			localFiles.id3process.placeQueue( songs );			
			}
		}, 500 )
	);
}

