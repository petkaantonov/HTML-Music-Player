var search = search || {};

search.infoText = "No search results";
search.ip = __IP_GET__();
search.placeholder = "Search for tracks";

new InputPlaceholder( "app-search-box", {text: search.placeholder, style: {color: "#999999"}});

search.historyTypes = {
	"youtube":"menur-youtube",
	"mp3":"menur-mp3"
};

search.validate = function( query ) {

	if( !query || query == search.placeholder ){
	return true;
	}

var type = $( "#app-youtube-mode")[0].checked ? "youtube" : "mp3";
search.main.search( type, query );
};

search.menu = new ActionMenu( "search-action-menu", {
	selector: ".app-action-tab",
	disabledClass: "app-action-disabled",
	name: "search"
}).activate( "none" );

search.menu.orderedActions = {
	"0":	function( songs ) {
		var $l = songs.length;
		playlist.main.add( songs ).changeSong( playlist.main.getHashByIndex( playlist.main.length - $l ) );
		},
	"1":	function( songs ) {
		download.main( songs[0] );
		},
	"2":	function( songs ) {
		playlist.main.add( songs );
		}
};
// Previous object mappings, must match :)
search.menu.actionsMap = {
	play: 0,
	download: 1,
	addToPlaylist: 2
};

search.selections = new Selectable( "app-result-container", ".app-result-tbody-tr", {activeClass: "app-result-active"} );

search.selections.onscroll = function( node ){
util.scrollIntoView.alignMiddle( node, document.getElementById( "app-result-container") );
};

search.suggestions = new SearchSuggestions( "app-search-suggestions-container", {
			activeClass: "app-search-suggest-active",
			suggestClass: ".app-search-suggestion",
			addClass: "app-search-suggestion notextflow",
			suggestAction: function( value, idx ) {
			search.validate( value );
			
			}
		}
);

search.suggestions.onsuggest = function( elm ) {
var pos = $( "#app-search-box-container" ).offset();

var left = pos.left, top = pos.top;

elm.style.left = left + "px";
elm.style.top = ( top + 20 )+ "px";

};

search.ytSuggestions = new YouTubeSuggestions( "app-search-box", {
	throttle: 300,
	handler: function( data ) {
		var arr = data && data[1] || [], query = data && data[0] || "";
		search.suggestions.newSuggestions( arr, query );
		}
	}
);
	
search.history = new History( 20 );
search.main = new Search( "app-result-container", {addClass: "notextflow app-result"});

search.menu.onmenuclick = function( menuID ) {
search.selections.applyTo( search.main.getContainer(), search.menu.orderedActions[ menuID ] );
};

search.history.onremoveentry = function(){
$( ".app-recent-search", $( "#app-menu-right" )[0] ).last().remove();
};

search.history.onnewentry = function( entries, newentries ) {
var entry = newentries[0], img = search.historyTypes[entry.type],
	query = entry.query, results = entry.results, elm;
	
elm = $( 	"<li onclick=\"search.history.ignore(); search.main.search( '"+entry.type+
		"', '"+query.addSlashes("'").htmlEncode()+
		"');\" style=\"display: none;\" class=\"app-recent-search notextflow "+img+"\">"+
		query+"</li>" );
		
$( "#app-recent-searches-header" ).after( elm );
elm.fadeIn( 2100 );
};

search.main.onbeforesearch = function( query, type){
$('#app-search-submit')[0].src = "images/search-ajax2.gif";
search.suggestions.hide();
	if( tabs.activeTab !== tabs.search ) {
	tabs.selectTab( tabs.getTab( tabs.search ) );
	}
document.getElementById( "app-search-info" ).innerHTML = "Loading...";
};

search.main.onaftersearch = function( query, type, results ){
$('#app-search-submit')[0].src = "images/magnifier.png";
$('#app-search-box').val( "" ).focus().blur();
search.selections.max = results;
search.history.add( {
	query: query,
	type: type,
	results: results
	});
search.suggestions.hide();
};



search.main.onsearchresults = function( results, query ) {

	new Table( "app-result-container", nodecache, {
			classPrefix: "app-result",
			captions: { 
				"name": "",
				"pTimeFmt": ""
			}
		}
	).addData( results, {
			"name": function( rowdata ){
			return "<div title=\"Play\" class=\"app-hover hover-play\"></div><div title=\"Add to playlist\" " +
				"class=\"app-hover hover-add\"></div><div class=\"notextflow app-row-result-name\">"+rowdata.name+"</div>";
			},
			"pTimeFmt": function( rowdata ){
			return "<div class=\"notextflow app-row-result-time\">"+(rowdata.pTimeFmt || "N/A")+"</div>";
			}
		}
	);
};

search.main.addType( "youtube", 
	function( query ) {
	var self = this, jsonp;

	jsonp = new JSONP( "http://gdata.youtube.com/feeds/api/videos", { 
				callbackP: "callback",

				timeout: 30,

				callback: function( jsonpad ) {
				var results = [], feed, title = jsonpad.feed.title.$t.substr( 31 ),
					i, l = 0;

				feed = jsonpad.feed.entry || null;

					if( feed && ( l = feed.length ) ) {

						for( i = 0; i < l; ++i ) {
						results.push( { 
							url: "youtube"+feed[i].link[0].href.match( /v=([0-9A-Za-z_-]{11})/ )[1], 
							name: feed[i].title.$t,
							pTime: feed[i].media$group.yt$duration.seconds,
							pTimeFmt: util.toTimeString( feed[i].media$group.yt$duration.seconds )
							});
						}
					search.infoText = "Found " + l + " results for <b class=\"notextflow app-max-word-length\">" + title + "</b> when searching MP3";
					} else {
					search.infoText = "No search results";
					}


				document.getElementById( "app-search-info" ).innerHTML = search.infoText;
				self.addResults.call( self, results, query, "youtube" );
				},

				params: {
					"restriction": search.ip,
					"format": 5,
					"q": query,
					"orderby": "relevance",
					"max-results": "50",
					"alt": "json-in-script"
				}
		});
	jsonp.execute();
});

search.main.addType( "mp3", 
		function( query ){
		var self = this;
		
		$.ajax({
		data: {query: query},
		datatype: "json",
		url: "ajax/search.php",
		method: "GET",
		success: function( feed ) {
		var results = [], feed, title = query,
			i, l = 0;
			

			if( feed && ( l = feed.length ) ) {

				for( i = 0; i < l; ++i ) {
					results.push( { 
					url: feed[i].url, 
					name: feed[i].title
					});
				}
			search.infoText = "Found " + l + " results for <b class=\"notextflow app-max-word-length\">" + title + "</b> when searching MP3";
			} else {
			search.infoText = "No search results";
			}
		
		document.getElementById( "app-search-info" ).innerHTML = search.infoText;
		self.addResults.call( self, results, query, "mp3" );
		},

		error: function(){
		document.getElementById( "app-search-info" ).innerHTML = search.infoText = "No search results" ;
		self.addResults.call( self, [] );
		}
	});
});

search.selections.onselect = function( selection ) {

var context = document.getElementById( "app-result-container" ),
	$elms = $( ".app-result-hover", context ),
	l = selection && selection.length || 0, idx;

updateSelection( l );
$elms.removeClass( "app-result-hover" );
$( ".app-hover", context ).css("visibility", "hidden");

	if( l ) {

		for( i = 0; i < l; ++i ) {
		$( ".app-hover", document.getElementById( "app-result-"+selection[i]) ).css("visibility", "visible");
		}
	search.menu.activate( "all" );
	}
	else {
	search.menu.activate( "none" );
	}

};

$( "#app-result-container").delegate( ".app-result-tbody-tr", "mouseenter mouseleave",
	function(e){
	var $this = $(this);
		if( $this.hasClass( "app-result-active" ) ) {
		return true;
		}

		if( e.type == "mouseenter" ){
		$this.addClass( "app-result-hover");
		$( ".app-hover", this ).css("visibility", "visible");
		}
		else {
		$this.removeClass( "app-result-hover");
		$( ".app-hover", this ).css("visibility", "hidden");
		}
	}
).delegate( ".app-result-tbody-tr", "dblclick",
	function(e){
	search.selections.applyTo( search.main.getContainer(), search.menu.orderedActions["0"]);
	}
).delegate( ".hover-play", "mousedown",
	function(e){
		if( e.which !== 1 ) {
		return true;
		}
	var id = this.parentNode.parentNode.id;
	id = id.substr( id.lastIndexOf("-") + 1 );
	search.menu.orderedActions[ search.menu.actionsMap.play ]( [ search.main.getContainer()[id] ] );
	}
).delegate( ".hover-add", "mousedown",
	function(e){
		if( e.which !== 1 ) {
		return true;
		}
	var id = this.parentNode.parentNode.id;
	id = id.substr( id.lastIndexOf("-") + 1 );
	search.menu.orderedActions[ search.menu.actionsMap.addToPlaylist ]( [ search.main.getContainer()[id] ] );
	}
);

$("#app-search-box").bind( "keyup",
	function( e ) {
		if( e.which === 13 ) {
		this.value = search.suggestions.getActiveSuggestion() || this.value;
		return search.validate( this.value );
		}
		else if( e.which === 27 ) {
		this.blur();
		}
	}
).bind("focus blur",
	function(e){
	var elm = document.getElementById("app-search-box-container");
		if(e.type=="focus"){
		elm.style.backgroundColor = "#EBF7FF";
		}else {
		elm.style.backgroundColor = "";
		}
	}
);



$("#app-search-submit").bind( "click", function( e ) {
search.validate( $("#app-search-box").val() );
});


$( "#app-mp3-mode").add("#app-youtube-mode").bind( "change",
	function(e){
	$( ".app-mode-label-selected").removeClass( "app-mode-label-selected" );
		if( $( "#app-youtube-mode")[0].checked ) {
		$( "#app-mode-youtube-label" ).addClass( "app-mode-label-selected" );
		}
		else {
		$( "#app-mode-mp3-label" ).addClass( "app-mode-label-selected" );		
		}
	}
);