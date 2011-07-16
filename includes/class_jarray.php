<?php

//ECMA 2.62 15.4.3.2

function is_jarray( $val ) {
return $val instanceof jarray;
}

//ECMA 2.62 15.4.1

function jarray() {
$args = func_get_args();
$reflection = new ReflectionClass( 'jarray' );
$instance = $reflection->newInstanceArgs( $args );
return $instance;
}

function jexplode( $separator, $str ) {
return jarray( explode( $separator, $str ) );
}

class jarray implements ArrayAccess, Iterator, Countable {

	private $pointer = 0;
	private $UNDEF;
	private $container;
	private $length = 0;

	/* MAGIC METHODS BEGIN */

	public function __construct() {
	
	$args = func_get_args();
	$this->container = array();
	
		//ECMA 2.62 15.4.2.1

		if( count( $args ) === 1 && is_array( $args[0] ) ){

	
			foreach( $args[0] as $val ) {
				if( is_array( $val ) ) $val = $this->assocToIndex( $val );
			$this->push($val);
			}
		}

		//ECMA 2.62 15.4.2.2

		else if( count( $args ) === 1 && is_numeric( $args[0] ) ){

		$this->length = $args[0];

		}

		//ECMA 2.62 15.4.2.1

		else { 
			if( count( $args ) ){
				foreach( $args as $value ){
				$this->push( $value );
				}
			}
		}

	$this->len();
	}

	public function __get( $name ) {

		if( $name == "length" ) {
		return $this->length;
		}
	}

	public function __set( $name, $val ) {

		if( $name == "length" ) {

			if( !is_numeric ( $val ) ) return;

			if ( $this->length === $val || $val < 0 ) {
			return;
			}

			else if( $val > $this->length ) {

			$oldle = $this->length;
			$dif = $val - $oldle;

				for( $i = $oldle; $i < $oldle + $dif; ++$i ) {
				$this->container[$i] = $UNDEF;	
				}

			$this->len();
			} 
		
			else if( $val < $this->length ) {
		
				for( $i = $val; $i < $this->length; ++$i ) {
				unset( $this->container[$i] );
				}
			$this->container = array_values( $this->container );
			$this->len();
			}
		}
	}

	public function __toString() {
	return "jarray";
	}

	//Countable implementation

	public function count(){
	return count ( $this->container );
	}

	//Iterator implementation

	public function rewind(){
	$this->pointer = 0;
	}

	public function current(){
	return $this->container[$this->pointer];
	}

	public function key(){
	return $this->pointer;
	}

	public function next(){
	$this->pointer++;
	}

	public function valid(){
		if( $this->pointer < $this->length ) return true;
	return $this->container[$this->pointer] !== $UNDEF;
	}

	//ArrayAccess implementation

	public function offsetSet($offset, $value) {
	$lens = count( $this );
	
		if( $offset > $lens ) {
			$dif = $offset - $lens;
			for( $i = $lens; $i < $lens+$dif; ++$i ) {
			$this->container[$i] = $UNDEF;
			}
				
		}

    	$this->container[$offset] = $value;
	$this->len();
       }
    
	public function offsetExists($offset) {
       return isset($this->container[$offset]);
       }

       public function offsetUnset($offset) {
       unset($this->container[$offset]);
	$this->container = array_values($this->container);
	$this->len();
    	}
    	
	public function offsetGet($offset) {
       return isset($this->container[$offset]) ? $this->container[$offset] : null;
    	}

	/* MAGIC METHODS END */

	/* PRIVATE METHODS BEGIN */

	private function assocToIndex( $arr ){
        $arr = array_values($arr);
        foreach($arr as $key => $val)
            if( is_array( $val ) && array_values( $val ) === $val)
                $arr[$key] = assocToIndex($val);
        
        return $arr;
	}

	// ECMA 2.62 15.4

	private function len() {
	$this->length = count( $this->container );
	}

	private function insertionSort ( $from, $to, $sortfun ) {

		for( $i = $from + 1; $i < $to; ++$i ) {
     		$element = $this->container[$i];
     			for ($j = $i - 1; $j >= $from; $j--) {
        		$tmp = $this->container[$j];
      			$order = $sortfun($tmp, $element);
       			if ( $order > 0 ) {
          			$this->container[$j + 1] = $tmp;
        			} else {
         			break;
        			}
      			}
      		$this->container[$j + 1] = $element;
    		}
	}

	private function last() {
	if( !$this->length ) return;
	return array($this->length-1, $this->container[$this->length-1]);
	}

	private function first(){
	if( !$this->length ) return;
		foreach( $this->container as $key => $value ){
		return array($key, $value);
		}
	}

	private function quickSort ( $from, $to, $sortfun ) {

		if ( $to - $from <= 10) {
     		$this->insertionSort( $from, $to, $sortfun );
     		return;
   		}

   	$v0 = $this->container[$from];
   	$v1 = $this->container[$to - 1];
   	$middle_index = $from + (($to - $from) >> 1);
    	$v2 = $this->container[$middle_index];

    	$c01 = $sortfun( $v0, $v1 );
   		if ( $c01 > 0 ) {
     		$tmp = $v0;
      		$v0 = $v1;
      		$v1 = $tmp;
    		}
	$c02 = $sortfun( $v0, $v2 );

  		if ( $c02 >= 0 ) {
		$tmp = $v0;
     		$v0 = $v2;
      		$v2 = $v1;
      		$v1 = $tmp;
    		}


		else {

  		$comot = $sortfun( $v1, $v2 ); 
      		
			if( $comot > 0 ) {
        		$tmp = $v1;
        		$v1 = $v2;
        		$v2 = $tmp;
      			}
  		}

    $this->container[$from] = $v0;
    $this->container[$to - 1] = $v2;
    $pivot = $v1;
    $low_end = $from + 1;
    $high_start = $to - 1;
    $this->container[$middle_index] = $this->container[$low_end];
    $this->container[$low_end] = $pivot;

	for( $i = $low_end + 1; $i < $high_start; ++$i ) {

		$element = $this->container[$i];
		$order = $sortfun( $element, $pivot );
			if( $order < 0 ){
			$this->swap($i, $low_end);
			$low_end++;
			}
			else if( $order > 0 ) {
				do {
				$high_start--;
					if ($high_start == $i) { }
				$top_elem = $this->container[$high_start];
				$order = $sortfun ( $top_elem, $pivot );
				} while ( $order > 0 );

			$this->swap($i, $high_start);
				if( $order < 0 ){
				$this->swap($i, $low_end);
				$low_end++;
				}
			}
	}
	$this->quickSort( $from, $low_end, $sortfun );
	$this->quickSort( $high_start, $to, $sortfun );
	}

	/* PRIVATE METHODS END */

	/* MUTATIVE METHODS BEGIN */

	public function splice($startidx, $amount = 0) {
		if( $amount > 0 && !$this->length ) return;
	$args = func_get_args();
	$r = array();
	
		if( $amount == 0 && count( $args ) <= 2){
		return $this;
		}
		else if( $amount == 0 && count( $args > 2 ) ) {
		$r = array_slice($args, 2);
			if( $startidx < 0 ){
			$startidx += $this->length;
			$startidx = $startidx < 0 ? 0 : $startidx;
			}

		$this->container = array_splice($this->container, $startidx, 0, $r);
		return $this;
		}


		if( count( $args ) > 2 ) {
		$r = array_slice($args, 2);
		$this->container = array_splice($this->container, $startidx, $amount, $r);
		return $this;
		}

	$this->container = array_splice($this->container, $startidx, $amount);
	return $this;
	}

	public function pop() {
	if( !$this->length ) return;
	$r = $this->last();
	$i = $r[0];
		for( ; ; --$i ) {
		unset( $this->container[$i] );
		break;
		}
	$this->container = array_values($this ->container );
	$this->len();
	return $r[1];
	}

	public function shift() {
	if( !$this->length ) return;
	$r = $this->first();
	$i = $r[0];
		for( ; ; ++$i ) {
		unset( $this->container[$i] );
		break;
		}
	$this->container = array_values($this ->container );
	$this->len();
	return $r[1];
	}

	public function unshift() {
	
	$args = func_get_args();

		if( !count($args) ) { trigger_error("Method jarray::unshift requires at least one argument", E_USER_WARNING); return; }

		foreach( $args as $value ) {
		array_unshift( $this->container, $value );
		}

	$this->len();
	return $this;
	}

	public function push() {
	$args = func_get_args();

		if( !count($args) ) { trigger_error("Method jarray::push requires at least one argument", E_USER_WARNING); return; }

		foreach( $args as $value  ){
		$this->container[] = $value;
		}
	$this->len();
	return $this;
	}

	public function reverse(){
	if( !$this->length ) return;
	$this->container = array_reverse($this->container);
	return $this;
	}

	public function swap($a, $b){
	if( !$this->length ) return;
	$tmp = $this->get($a);
	$this->set($a, $this->get($b));
	$this->set($b, $tmp);	
	}

	public function fill($begin, $end, $interval = 1) {
		
		if( $interval < 1 ) $interval = 1;
		for( $i = $begin; $i <= $end; $i += $interval ){
		$this->push( $i );
		}
	$this->len();
	return $this->length;
	}

	public function sort() {
	if( !$this->length ) return;
	$args = func_get_args();
	$sortfun = create_function('$x, $y', '$x = (string)$x; $y = (string)$y; return strcmp($x, $y);');
	
	if( count( $args ) == 2 && is_string ( $args[0] ) && is_string ( $args[1] ) )  $sortfun = create_function($args[0], $args[1]); 

	
	$fi = $this->first();
	$la = $this->last();
	$this->quickSort($fi[0], $la[0] + 1, $sortfun);
	return $this;
	}

	public function reIndex(){
	$this->container = array_values( $this->container );
	$this->len();
	return $this;
	}

	/* MUTATIVE METHODS END */

	public function toSource() {
	if( !$this->length ) return "new jarray()";

	$str = "new jarray(array(";
	$l = 0;
		foreach( $this->container as $value ) {
		$separator = $l >= $this->length - 1 ? "" : ", ";
			if ( is_string( $value ) ){
			$str .= "\"$value\"$separator";
			}else{
			$str .= $value . $separator;
			}
		$l++;
		}
	$str .= "))";
	return $str;
	}

	public function toPhpArray() {
	return $this->container;
	}

	public function slice( $startidx, $len ) {
	if( !$this->length ) return;
	return new jarray(array_slice($this->container, $startidx, $len));
	}

	public function concat() {
	
	$args = func_get_args();
	$re = new jarray($this->container);
		if( !count( $args ) ) { trigger_error("Method jarray::concat requires at least one argument", E_USER_WARNING); return; }

		foreach( $args as $value ) {

			if( !is_array( $value ) && !$value instanceof jarray ) continue; 
			
				foreach( $value as $arrvalue ) {
				$re->push( $arrvalue );
				}
		}
	$this->len();
	return $re;
	}

	public function indexOf( $value, $startindex = 0 ) {
	$args = func_get_args();
		if( !$this->length ) return -1;

	$n = 0;
		if( count ($args) > 1 ) {
		$n = (int)$args[1];
		}

		if( $n < 0 ) $n += $this->length;
		if( $n < 0 ) $n = 0;
		if( $n >= $this->length ) return - 1;

	$start = $n > 0 ? $n : 0;

		for( $i = $start; $i < $this->length; ++$i ) {

			if( $this->container[$i] === $value ) {
			return $i;
			}

		}
	return -1;
	}

	public function lastIndexOf ( $value ) {
	$args = func_get_args();
		if( !$this->length ) return -1;

	$n = $this->length - 1;
		if( count ($args) > 1 ) {
		$n = (int)$args[1];
		}

		if( $n < 0 ) return -1;
		if( $n >= $this->length ) $n = $this->length - 1;

	$k = $n !== $this->length - 1 ? $n : $this->length - 1;

		while( $k >= 0 ) {

			if( $this->container[$k] === $value ) {
			return $k;
			}
		--$k;
		}
	return -1;
	}

	public function join( $separator = "" ) {
	$separator = $separator && is_string( $separator ) ? $separator : "";
		if( !$this->length ) return "";
	$str = "";
	$cc = 0;
		foreach( $this->container as $val ) {
			if ( is_array( $val ) ) { $val = new jarray( $val ); $val = $val->join($separator);}
			if ( $cc >= $this->length - 1 ) $separator = "";
			
		$str .= $val . $separator;
		$cc++;
		}
	return $str;
	}

	public function unique() {
	$un = array();
	$r = jarray();
		foreach( $this as $val ) {
		$un[$val] = $val;
		}

		foreach( $un as $val ) {
		$r->push($val);
		}

	return $r;
	}

	public function get( $idx ) {
	if( !$this->length ) return;
	return $this->container[$idx] !== NULL ? $this->container[$idx] : NULL;
	}

	public function set( $idx, $value ) {
	$this->container[$idx] = $value;
	$this->len();
	return $this;
	}

	public function filter() {
	$args = func_get_args();
		if( !$this->length || !( count( $args ) === 2 && is_string( $args[0] ) && is_string( $args[1] ) ) ) { 
		trigger_error("Method jarray::filter requires two string arguments for a custom function", E_USER_WARNING);
		return;
		}
	$filterfun = create_function( $args[0], $args[1] );
	$re = new jarray();
	$c = 0;
		foreach( $this->container as $value ) {
		$t = $value;
			if( $filterfun( $c, $t, $this->container ) ) {
			$re->push( $t );
			}

		$c++;
		}
	return $re;
	}

	public function map() {
	$args = func_get_args();
		if( !$this->length || !( count( $args ) === 2 && is_string( $args[0] ) && is_string( $args[1] ) ) ) { 
		trigger_error("Method jarray::map requires two string arguments for a custom function", E_USER_WARNING);
		return;
		}
	$filterfun = create_function( $args[0], $args[1] );
	$re = new jarray();
	$c = 0;
		foreach( $this->container as $value ) {
		$t = $value;
		$re->push( $filterfun( $c, $t, $this->container ) );
		$c++;
		}
	return $re;
	}

	public function every() {
	$args = func_get_args();
		if( !$this->length || !( count( $args ) === 2 && is_string( $args[0] ) && is_string( $args[1] ) ) ) { 
		trigger_error("Method jarray::every requires two string arguments for a custom function", E_USER_WARNING);
		return;
		}
	$filterfun = create_function( $args[0], $args[1] );

	$c = 0;
		foreach( $this->container as $value ) {
		$t = $value;
			if( !$filterfun( $c, $t, $this->container ) ) {
			return false;
			}

		$c++;
		}
	return true;
	}

	public function some() {
	$args = func_get_args();
		if( !$this->length || !( count( $args ) === 2 && is_string( $args[0] ) && is_string( $args[1] ) ) ) { 
		trigger_error("Method jarray::some requires two string arguments for a custom function", E_USER_WARNING);
		return;
		}
	$filterfun = create_function( $args[0], $args[1] );

	$c = 0;
		foreach( $this->container as $value ) {
		$t = $value;
			if( $filterfun( $c, $t, $this->container ) ) {
			return true;
			}

		$c++;
		}
	return false;
	}

	public function withEach() {
	$args = func_get_args();
		if( !$this->length || !( count( $args ) === 2 && is_string( $args[0] ) && is_string( $args[1] ) ) ) {
		trigger_error("Method jarray::withEach requires two string arguments for a custom function", E_USER_WARNING);
		return;
		}
	$filterfun = create_function( $args[0], $args[1] );
	$c = 0;
		foreach( $this->container as $value ) {
		$t = $value;
		$filterfun( $c, $t, $this->container );
		$c++;
		}
	}

	public function inspect() {
	return print_r( $this, true );
	}

	public function duplicate() {
	return clone $this;
	}

	public function translate() {
	$args = func_get_args();

		if( !$this->length ) return;
	
	$r = $this->duplicate();

		if( !count( $args ) ) return $r;

	$objTmp = (object) array( 'aFlat' => array() );
	array_walk_recursive( $r->toPhpArray(), create_function('&$v, $k, &$t', '$t->aFlat[] = $v;'), $objTmp );
	$r = $objTmp->aFlat;

		for ( $i = 0; $i < count( $r ); ++$i ) {
			foreach( $args as $funcval ) {
				if( function_exists( $funcval ) ){
				$r[$i] = $funcval( $r[$i] );
				}else{
				continue;
				}
			}
		}
	$r = new jarray($r);
	return $r;
	}

	public function reduce() {
	$args = func_get_args();
		if( !$this->length || !( count( $args ) >= 2 && is_string( $args[0] ) && is_string( $args[1] ) ) ) {
		trigger_error("Method jarray::reduce requires two string arguments for a custom function", E_USER_WARNING);
		return;
		}
	
	$previous = $this->first();
	$previous = $previous[1];

		if( count( $args ) >= 3 ) {
		$previous = $args[2];
		}
		
	$filterfun = create_function( $args[0], $args[1] );
	$c = 0;
	$accum = $previous;
		foreach( $this->container as $value ) {
			if( count( $args ) < 3 && $c === 0) {
			$c++;
			continue;
			}
		$current = $value;
		$accum = $filterfun( $accum, $current, $c, $this->container );
		$c++;
		}
		if( is_array($accum) ) $accum = new jarray($accum);
	return $accum;
	}

	public function min() {
	if( !$this->length ) return;
	$m = null;
		foreach( $this as $val ) {
		$m = $m === null || $val < $m ? $val : $m;
		}
	return $m;
	}

	public function max() {
	if( !$this->length ) return;
	$m = null;
		foreach( $this as $val ) {
		$m = $m === null || $val > $m ? $val : $m;
		}
	return $m;
	}

	public function avg() {
	if( !$this->length ) return;
	$m = 0;
		foreach( $this as $val ) {
		$m += $val;
		}
	return $m / count( $this );
	}

	//translate alias
	public function transform() {
	$args = func_get_args();
	$r = new ReflectionMethod( "jarray", "translate" );
	return $r->invokeArgs ( $this, $args );
	}

	public function median(){
	if( !$this->length ) return;
	$k = $this->duplicate();
	$k->reIndex()->sort('$a, $b', 'return $a - $b;');
	
		if( count( $k ) & 1 ) {
		$m = $k[count( $k ) >> 1];
		}
		else {
		$v1 = $k[( count( $k ) >> 1 ) - 1];
		$v2 = $k[( count( $k ) >> 1 )];
		$m = ( $v1 + $v2 ) / 2;
		}
	return $m;
	}

	public function joinWrap(  $wrapper, $separator = "AND" ){

	if( is_string( $wrapper ) && strlen ( $wrapper ) ) {
		global $JARRAY_JOINAND_WRAPFUNC;
		$JARRAY_JOINAND_WRAPFUNC = create_function( '$str', 'return str_replace( "%w", $str, "'.$wrapper.'" );' );
		return rtrim( $this->transform($JARRAY_JOINAND_WRAPFUNC, "trim")->join( " ".$separator." " ) );
		}

	return false;

	}

	public function joinWrapBrace(  $wrapper, $separator = "AND" ){

	if( is_string( $wrapper ) && strlen ( $wrapper ) ) {
		global $JARRAY_JOINAND_WRAPFUNC;
		$JARRAY_JOINAND_WRAPFUNC = create_function( '$str', 'return str_replace( "{%w}", $str, "'.$wrapper.'" );' );
		return rtrim( $this->transform($JARRAY_JOINAND_WRAPFUNC, "trim")->join( " ".$separator." " ) );
		}

	return false;

	}

	public function unite( $union = " " ) {
	$args = func_get_args();
	$r = jarray();

		for( $i = 0; $i < $this->length; ++$i ) {
		$begin = $this[$i];
			for( $j = 1; $j < count( $args ); ++$j ) {
			$begin .= $union . $args[$j][$i];
			}
		$r->push( $begin );
		}

	return $r;
	}

	public function implode( $separator = "," ){
	return $this->join( $separator );
	}
}


?>