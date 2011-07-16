function DraggableSelection( target, selectable, playlist, itemHeight, selector ) {
var self = this;

target = typeof target == "string" ? document.getElementById( target ) : target;

	if( !target.id ) {
	target.id = "draggable-container-"+(+new Date );
	}
	
this._target = target.id;
this._songList = playlist._hashList;
this._selection = selectable._selection;
this._selectable = selectable;
this._playlist = playlist;
this._proximity = [];
this._selector = selector;
this._itemHeight = itemHeight;
this._nodes = [];
this._posChanged = false;
this._prevTotalOffset = null;
this._listOffset = 0;
this._listHeight = 0;
this._itemHeight = itemHeight;
this._lastCoord = 0;
this._init();
}

DraggableSelection.Includes({
	_mouseup: $.noop,
	_trigger: $.noop,
	_createMouseRelease: function(){
	var self = this;
		return function(){
			$( "#"+self._target ).unbind( "scroll", self._trigger );
			$( document ).unbind( "mousemove", self._trigger ).unbind("mouseup", self._mouseup);
			self._prevTotalOffset = null;
				if( self._posChanged ) {
				self._posChanged = false;
				self._playlist.render();
				}
		};
	},
	_createTriggerer: function(){
	var self = this;
		return function(e){
		$( "#"+self._target).trigger( "moving", [e] );
		};
	},
	_init: function(){
	var self = this;
	this._trigger = this._createTriggerer();
	this._mouseup = this._createMouseRelease();
		$("#"+this._target).bind( "selectstart", 
			function(){
			return false;
			}
		).delegate( this._selector, "mousedown",
			function( evt ) {
			var parent;
				if( evt.which !== 1 ) {
				return true;
				}
			parent = document.getElementById( self._target );	
			self._listOffset = parent.offsetTop;
			self._listHeight = parent.offsetHeight;
			self._proximity = self._selectable._selection.mapProximity();
			self._nodes = $( self._selector ).toArray();
			$( parent ).bind("scroll", self._trigger );
			$( document ).bind("mousemove", self._trigger ).bind( "mouseup", self._mouseup );
			}
		).bind( "moving",
			function( evt, evtreal ) {
			var undef;
				if( evtreal.pageY === undef ) {
				evtreal.pageY = self._lastCoord;
				}
				else {
				self._lastCoord = evtreal.pageY;
				}
			var coordsY = evtreal.pageY, curTotalOffset = coordsY + this.scrollTop,
				direction, treshold, selection = self._selectable._selection, target,
				lastSong = self._playlist._hashList.length - 1, prevTotalOffset = self._prevTotalOffset,
				listOffset = self._listOffset, listHeight = self._listHeight, itemHeight = self._itemHeight;

				if( prevTotalOffset == null || prevTotalOffset === curTotalOffset) {
				self._prevTotalOffset = curTotalOffset;
				return true;
				}

			coordsY = coordsY - listOffset > listHeight ? listHeight + listOffset : coordsY;
			coordsY = coordsY - listOffset < 0 ? listOffset : coordsY;
			direction = curTotalOffset > prevTotalOffset ? "down" : "up";

			treshold = ( ( prevTotalOffset - listOffset ) / itemHeight ) >> 0;
			self._prevTotalOffset = curTotalOffset;
			target = ( ( curTotalOffset - listOffset ) / itemHeight ) >> 0;

				if( target !== treshold ) {

					if( 	( selection.bSearch( 0 ) > -1 && direction == "up" ) ||
						( selection.bSearch( lastSong ) > -1 && direction === "down" ) ){
					return true;
					}

				self._multiSwap[ direction ].call( self, target );
				}
			}
		);	
	},
	_multiSwap: {
			up : function( calledTarget ){
			var pMap = this._proximity, selection = this._selectable._selection,
				$l = pMap.length, $$l = selection.length - 1, returned, target, l, copy = [],
				firsthead = null, j, copyhead = pMap[0][0];
				
			var storetarget = calledTarget >= selection[0] ? selection[0] - 1 : calledTarget;
				for(j = 0; j < $l; ++j){
					if(firsthead !== null){
					target = pMap[j][0] - ( firsthead - storetarget );
					}
					else {
					target = storetarget;
					firsthead = copyhead;
					}
				
				returned = this._swapByMap.up.call( this, target, pMap[j] );
				copy.push.apply( copy, returned );
				pMap[j] = returned;
				}
			this._selectable._selection = this._selection = copy && copy.length ? copy : selection;
			this._posChanged = true;
			},
			
			down : function( calledTarget ){
			var pMap = this._proximity, selection = this._selectable._selection,
				$l = pMap.length, $$l = selection.length - 1,
				returned, target, l = pMap[$l-1].length - 1, copy = [],
				firsthead = null, j;
			var storetarget = calledTarget <= selection[$$l] ? selection[$$l] + 1 : calledTarget;
			var z, copyhead = pMap[$l-1][l];
				for( j = $l-1; j >= 0; --j ){
				z = pMap[j].length - 1;
					if(firsthead !== null){
					target = storetarget - firsthead + pMap[j][z];
					}else{
					target = storetarget;
					firsthead = copyhead;
					}
				returned = this._swapByMap.down.call( this, target, pMap[j]);
				copy.push.apply( copy, returned );
				pMap[j] = returned;
				}
			copy.sort(function(a, b){return (a - b);});
			this._selectable._selection = this._selection = copy && copy.length ? copy : selection;
			this._posChanged = true;
			}
	},
	_swapByMap: {
		up: function( target, proxArr ) {
		var head, tail, dif, mapChanges = [], ret = [],
			changeLog = [[],[]], str, itemHeight = this._itemHeight,
			$l = proxArr.length, l = $l - 1, i, nodes = this._nodes, node, nodeFC;
		
		head = proxArr[l];
		tail = proxArr[0];
		dif = tail - target;
		
				for( i = target; i <= head; ++i ) {
				node = nodes[i];
				nodeFC = node.firstChild;
					if( i < tail ) {
					str = i+$l+1;
					changeLog[0].push( i );
					changeLog[1].push( i + $l );
					node.style.top = ( ( i + $l ) * itemHeight ) + "px";
					nodeFC.id = "app-song-" + ( i + $l );
					}
					else if( i >= tail ){
					mathtostring = i-dif+1;
					changeLog[0].push( i );
					changeLog[1].push( i - dif );
					node.style.top = ( ( i - dif ) * itemHeight ) + "px";
					nodeFC.id = "app-song-" + ( i - dif );
					mapChanges.push( i );
					ret.push( i - dif );
					}
				}

		this._nodes.targetMapSwap( target, mapChanges );
		this._songList.targetMapSwap( target, mapChanges );
		return ret;		
		
		},
		down: function( target, proxArr ) {
		var trackAmount = this._songList.length - 1, $l = proxArr.length,
			l = $l - 1, head = proxArr[l], tail = proxArr[0],
			dif, mapChanges = [], ret = [],
			changeLog = [[],[]], i, node, nodeFC, nodes = this._nodes,
			itemHeight = this._itemHeight;
		
		target = target >= trackAmount ? trackAmount : target;
		dif = target - head;
			for( i = tail; i <= target; ++i ) {
			node = nodes[i];
			nodeFC = node.firstChild;
				if( i <= head ) {
				node.style.top = ( ( dif + i ) * itemHeight ) + "px";
				nodeFC.id = "app-song-" + ( dif + i );
				changeLog[0].push( i );
				changeLog[1].push( i + dif );
				mapChanges.push( i );
				ret.push( i + dif );
				}
				else if( i > head ){
				changeLog[0].push( i );
				changeLog[1].push( i - $l );
				node.style.top = ( ( i - $l ) * itemHeight ) + "px";
				nodeFC.id = "app-song-" + ( i - $l );
				}
			}

		this._nodes.targetMapSwap( target, mapChanges );
		this._songList.targetMapSwap( target, mapChanges );
		return ret;
		
		
		}
	}
	
});