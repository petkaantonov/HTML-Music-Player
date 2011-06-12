var filter = filter || {};


filter.scrollIntoView = function( node, parentNode ) {
	if( !node || !parentNode ) {
	return;
	}
var nodeOffset = node.offsetTop, parentHeight = parentNode.offsetHeight,
	parentScrollTop = parentNode.scrollTop, dif, mid;
	
dif = nodeOffset - ( parentHeight / 2 );

	if( dif < 0 ) {
	dif = 0;
	}
parentNode.scrollTop = dif;
	
};

filter.applySelection = function(){
obj = filter.searcher.getResultByIndex( filter.selected );
		if( obj) {
		playlist.main.changeSong( obj.hash );
		popup.closeAll();
		elm = document.getElementById( "app-song-"+playlist.main.getPositionByHash( obj.hash ) ).parentNode;
		filter.scrollIntoView( elm, elm.parentNode );
		}		
};

filter.traveler = function( selections ) {
var browsekeys = {
	"37":"prev",
	"38":"prev",
	"40":"next",
	"39":"next"
};

	return function(e){
	var obj, elm;
		if( e.target.tagName == "input" ) {
		return true;
		}

		if( e.which in browsekeys ) {
		selections[browsekeys[e.which]]();
		}
		else if ( e.which == 13 ) {
		filter.applySelection();
		}
	};
};

filter.show = function showFilter () {


popup.open( "<h2 class=\"app-header-2\">Filter</h2>" +
	"<div class=\"app-bread-text\">Find tracks on the playlist that match the given text.</div>" +
	"<input type=\"text\" id=\"app-filter-input\" spellcheck=\"false\" autocomplete=\"off\" "+
	"style=\"margin-top:8px;width:210px;display:block;\" class=\"app-bread-text app-popup-input\">" +
	"<div style=\"margin-top:15px;width:120px;border-bottom:1px dotted #333333; " +
	"line-height: 15px;\" class=\"app-hotkey-header\">Results</div>" +
	"<div id=\"app-filter-results\"></div>", 
	400, 500 );
	
filter.searcher = new ClientsideSearcher( playlist.main.toArray( true ), "name" );

var selections = new TraversableSingleSelectable( "app-filter-results", ".app-filter-result", {activeClass: "app-filter-result-selected"}),
	traveler = filter.traveler( selections );
	
$( "#app-filter-results" ).delegate( ".app-filter-result", "dblclick", filter.applySelection);

filter.searcher.onbeforesearch = function(){
selections.reset();
selections.length = 0;
};

filter.searcher.onaftersearch = function( res ){
var i, l = res.length, r = [""];
selections.length = l;
	for( i = 0; i < l; ++i ) {
	r.push( "<div class=\"app-filter-result notextflow\" id=\"filter-result-"+i+"\">"+res[i].name+"</div>");
	}
$( "#app-filter-results" )[0].innerHTML = r.join("");
};

selections.onselect = function( idx ){
filter.selected = idx;
};

selections.onscroll = function( idx ){
var node;
	if( idx != null ) {
	node = document.getElementById( "filter-result-"+idx);
	filter.scrollIntoView( node, node.parentNode );

	}
};

$(document).bind("keydown", traveler);

$( "#app-filter-input" ).bind( "keydown", function(e) {
var obj;
e.stopPropagation();
	switch( e.which ) {
	case 39:
	case 37:
	return true;
	
	case 38:
	selections.prev();
	return true;
	case 40:
	selections.next();
	return true;
	case 27:
	this.value = "";
	this.blur();
	popup.closeAll();
	return true;
	case 13:
	filter.applySelection();
	return true;
	}
	
filter.searcher.search( this.value );
})[0].focus();

popup.closeEvent( function(){ 
$(document).unbind("keydown", traveler );
});

return false;
};

