var features = features || {};

(function(){
var $elms = $( ".menul-save").add( ".menul-load"), input = document.createElement("input"),
	div = document.createElement("div"), styles = div.style, audio = document.createElement( "audio" ),
	c, localfile = !!( window.URL || window.webkitURL || null ), key, missingFeatures = 0, featureDescriptions = [], str = "", saved,
	classn = " app-action-disabled", disabled = " disabled=\"disabled\"", appDataSave = {}, allowtypes = ["application/json"],
	featuremap = {
	"mp3": "audio/mp3",
	"wav": "audio/wav",
	"ogg": "video/ogg,audio/ogg"
	};


	
features.mp3 = false;
features.wav = false;
features.ogg = false;
features.readFiles = false;
features.dragFiles = false;

	if ( window.localStorage ) {
	appDataSave = storage.get("appData") || {};
	classN = "";
	disabled = "";
	features.localStorage = true;
			
	} else {
	features.localStorage = false;
	}
	
	if( "webkitdirectory" in input ||
		"directory" in input ||
		"mozdirectory" in input ) {
	
		$(function(){
		$('.menul-folder').fileInput( {
			onchange: function(){
			playlist.localFiles.handle( this.files );
			},
			id: "file-folder-input",
			style: {cursor: "pointer"},
			webkitdirectory: true,
			directory: true,
			mozdirectory: true
			},
			"app-action-tab-selected" );
		});
	features.directories = true;
	}
	else {
	$( ".menul-folder").addClass( "app-action-disabled" );
	features.directories = false;	
	}
	
	if( "textShadow" in styles &&
		"borderRadius" in styles &&
		"boxShadow" in styles ) {
	features.graphics = true;	
	}
	else {
	features.graphics = false;
	}
	
	if( typeof FileReader == "function" && new FileReader().readAsBinaryString ) {
	features.readFiles = true;
	}
	
	if ( "files" in input && ( "ondrop" in input || ( !input.setAttribute("ondrop", "") && typeof input["ondrop"] == "function" ) ) ) {
	features.dragFiles = true;
	}
	
	if( audio && typeof audio.canPlayType == "function" && localfile && features.readFiles ) {
		features.mp3 = !!( audio.canPlayType( "audio/mp3" ).replace( /no/gi, "" ) );
		features.wav = !!( audio.canPlayType( "audio/ogg" ).replace( /no/gi, "" ) );
		features.ogg = !!( audio.canPlayType( "audio/wav" ).replace( /no/gi, "" ) );
		
		for( key in features ) {
			if( featuremap[key] && features[key] === true ) {
			allowtypes.push.apply( allowtypes, featuremap[key].split(",") );
			}
		}
	}
	
	
	$( ".menul-load" ).bind( "click" , function(){
	var playlists = window.localStorage && storage.get( "PlaylistJSON" ) || {}, key, data = [], playl, $l;

		for( key in playlists ) {
		data.push( {time: playlist.getTotalTime( playlists[key] ), name: key, length: playlists[key].length, load: "<span class=\"app-clickable menul-load\" onclick=\"playlist.loader.load('"+key.addSlashes("'")+"');\">Load</span>"});
		}

	$l = data.length;
	playl = $l === 1 ? "playlist" : "playlists";

	popup.open( 	"<h2 class=\"app-header-2\">Load playlist</h2>" +
			"<div id=\"app-playlists-table\"></div>" +
			"<div style=\"float:left;font-size:11px;\">"+( window.localStorage ? "Listing "+$l+ " "+ playl+" found in browser memory</div>" :
			"No access to browser memory") +
			"<div class=\"app-popup-solution\">" +
			"<div style=\"position:relative;width:128px;height:30px;\">" +
			"<div id=\"app-proceed-load\" class=\"app-popup-button right\">Load from File</div>" +
			"<input type=\"file\" onmouseover=\"$(this.previousSibling).addClass('app-popup-button-active');\""+
			" onmouseout=\"$(this.previousSibling).removeClass('app-popup-button-active');\" style=\"width:114px;height:30px;\"" +
			" class=\"hidden-file-input-hack\" onchange=\"playlist.loader['import']( this.files[0] );\" />" +
			"</div></div>" );
			
	new Table( "app-playlists-table", nodecache, {
			classPrefix: "app-feature",
			captions: { 
				name: "Name",
				length: "Track amount",
				time: "Total playtime",
				load: ""
			}
		}
	).addData( data );

});



	$( ".menul-save" ).bind( "click", function(){


	popup.open( "<h2 class=\"app-header-2\">Save playlist</h2>" +
			"<div class=\"app-bread-text app-form-container\">" +
			"<input type=\"text\" id=\"playlist-name\" spellcheck=\"false\" autocomplete=\"off\"" +
			" value=\""+(appDataSave.playlistName || "Playlist Name")+"\" class=\"app-bread-" +
			"text app-popup-input\"></div>" +
			"<div style=\"margin-top: 7px\" class=\"app-bread-text\"><input "+(!window.localStorage || appDataSave.saveMethod == "file" ? "checked ":"")+
			"type=\"radio\" name=\"savetype\" id=\"app-save-file\">" +
			"<label for=\"app-save-file\">Save as file</label>" +
			"<input type=\"radio\""+disabled+" "+(window.localStorage && ( appDataSave.saveMethod == "mem" || !appDataSave.saveMethod ? "checked ":"" ))+
			"name=\"savetype\" id=\"app-save-memory\">" +
			"<label for=\"app-save-memory"+classN+"\">Save in browser memory</label></div>" +
			"<div class=\"notextflow\" id=\"app-popup-message\"></div> " +
			"<div class=\"app-popup-solution\"><div id=\"app-proceed-save\" class=\"app-popup-button\">Save Playlist</div></div>",
			400,
			155 );
	});

	$( "#app-proceed-save" ).live( "click", function(){
	var name = $( "#playlist-name"), nam;
		if( !( nam = name[0].value ) ) {
		name.focus();
		return this;
		}
		if( $( "#app-save-file")[0].checked  ) {
		playlist.saver["export"]( nam, playlist.main.toArray() );
		}
		else {
			if( window.localStorage ) {
			playlist.saver.save( nam, playlist.main.toArray() );
			}
		}
	});
	
	featureDescriptions.push({ desc: "Play MP3 files located on your computer", name: "Local MP3", enabled: ( !features.mp3 && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS ) },
			{ desc: "Play OGG files located on your computer", name: "Local Ogg Vorbis", enabled: ( !features.ogg && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS ) },
			{ desc: "Play WAV files located on your computer", name: "Local WAVE", enabled: ( !features.wav && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS )  },
			{ desc: "Read local binary files", name: "File reader", enabled: ( !features.readFiles && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS )  },
			{ desc: "Drag &amp; Drop local audio files", name: "Drag &amp; Drop files", enabled: ( !features.dragFiles && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS )  },
			{ desc: "Save and load playlists", name: "Local storage", enabled: ( !features.localStorage && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS )  },
			{ desc: "Add entire directories of local files at once", name: "Directories", enabled: ( !features.directories && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS )  },
			{ desc: "Better graphics, such as shadows and rounded corners", name: "CSS3 Graphics", enabled: ( !features.graphics && ( ++missingFeatures ) ? TEST_FAIL : TEST_PASS )  } );	

playlist.localFiles = new LocalFiles( allowtypes );
playlist.localFiles.onhandle = function(files){

$("#file-folder-input").removeFiles();

	if( files.length ) {
	playlist.main.add( files );
	}
};

	if( missingFeatures === 0 || appData.lowFeatures ) {
	return;
	}

appSetData( "lowFeatures", true );

popup.open( "<h2 class=\"app-header-2\">Browsers features missing:</h2><div id=\"" +
		"app-feature-table\"></div><div style=\"margin-top:20px;font-size:11px;\">"+
		"Some features aren't supported by your browser, perhaps it's time to try " +
		"<a href=\"http://www.google.com/chrome/\" target=\"_blank\">Google Chrome</a>?"+
		"</div>" );
		
		
	
new Table( "app-feature-table", nodecache, {
		classPrefix: "app-feature",
		captions: { 
			name: "Feature",
			desc: "Description",
			enabled: "Supported"
		}
	}
).addData( featureDescriptions );



})()