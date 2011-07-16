<?php

if( !function_exists( "jarray" ) ) {
require_once 'class_jarray.php';
}

function FastQuery() {
$args = func_get_args();
$reflection = new ReflectionClass( "FastQuery" );
$instance = $reflection->newInstanceArgs( $args );
return $instance;
}

function hipsut( $val ){
return '\''.$val.'\'';
}

class FastQuery {

	private $ordering = "DESC";
	private $lastquery = "";
	private $db = false;
	private $connected = false;

	public function __construct( $server, $username, $password, $database = "" ) { 

	$this->connected = mysql_connect( $server, $username, $password );
	
		if( $database && strlen( $database ) && $this->connected ) {
		$this->db = mysql_select_db( $database, $this->connected );
		}	
	
	}

	public function __toString() {
	return $this->connected && $this->db ? "Connection successful" : "Connection failed";
	}

	public function __destruct() {
	mysql_close( $this->connected );
	}

	public function db( $database ) {

		if( $database && strlen( $database ) && $this->connected ) {
		$this->db = mysql_select_db( $database, $this->connected );
		}

	}

	public function is_connected() {
	return $this->connected && $this->db;
	}

	public function insert( $tablename, $columns, $values = "") {
	if( is_array ( $columns ) ) {
	$values = jarray ( array_values ( $columns ) );
	$columns = jarray ( array_keys ( $columns ) );
	}else {
	if( is_string( $columns ) ) $columns = jexplode( " ", $columns );
	if( is_string( $values ) )$values = jexplode( " ", $values );
	}
	

		if ( $columns->length !== $values->length ) {
		return false;
		}

	$query = 'INSERT LOW_PRIORITY INTO '. $tablename . '( ' . $columns->join(", ") .' ) VALUES( '. $values -> transform( "hipsut" )->join(", ") . ' )';
	$this->lastquery = $query;
	$success = @mysql_query( $query, $this->connected );
	return $success ? true : false;

	}

	public function lastQuery() {
	return $this->lastquery;
	}

	public function debug( $nl = "<br>" ) {
	return $this->lastquery .$nl. mysql_error( $this->connected );
	}

	public function swapOrder() {
	$this->ordering = $this->ordering === "DESC" ? "ASC" : "DESC";
	return $this;
	}

	public function custom( $query ) {

	$resultset = array( "SELECT" => true, "SHOW" => true, "DESCRIBE" => true, "EXPLAIN" => true );
	$querytype = strtoupper ( substr( $query, 0, strpos( $query, " " ) ) );
	$this->lastquery = $query;

		if( $resultset[$querytype] ) {		
		$results = @mysql_query( $query, $this->connected );

			if( !@mysql_num_rows( $results ) ) { return false; }

		$r = jarray();

			while( $rivi = mysql_fetch_assoc ( $results ) ) {
			$r->push( $rivi );
			}
	
		return $r;

		}
		else{
		$success = mysql_query( $query, $this->connected );
		return $success ? true : false;
		}

	}

	public function replace( $tablename, $columns, $values = "", $where = "" ) {

		if( is_array ( $columns ) ) {
		$values = jarray ( array_values ( $columns ) );
		$columns = jarray ( array_keys ( $columns ) );
		}
		else{
		if( is_string( $columns ) ) $columns = jexplode( " ", $columns );
		if( is_string( $values ) )$values = jexplode( " ", $values );
		}

		if ( $columns->length !== $values->length ) {
		return false;
		}
	
	$query = 'UPDATE ' . $tablename . ' SET';

	$values = $values -> transform("hipsut");
	$union = $columns -> unite( " = ", $values );

	$query .= ' '.$union->join(", ");

		if( $where && strlen( $where ) ) {
		$query .= ' WHERE '. trim( $where );
		}

	$this->lastquery = $query;

	$success = mysql_query( $query, $this->connected );
	return $success ? true : false;

	}

	public function escape( $str ) {
	return mysql_real_escape_string ( $str, $this->connected );
	}

	public function escapejarr( jarray $jarr ) {
	return $jarr -> transform( "mysql_real_escape_string" );
	}

	public function lastID() {
	return mysql_insert_id( $this->connected );
	}

	public function resultCount() {
	$row = mysql_fetch_row( mysql_query( "SELECT FOUND_ROWS();" ) );
	return $row[0];
	}

	public function retrieve( $tablename, $columns, $where = "", $order = "", $limit = 0 ) {
	if( is_string( $columns ) ) $columns = jexplode( " ", $columns );

	$query = 'SELECT ' . $columns->join(", ") . ' FROM ' . $tablename;
	
		if( $where && strlen( $where ) ) {
		$query .= ' WHERE '. trim( $where );
		}

		if( $order && strlen( $order ) ) {
		$query .= ' ORDER BY '. trim( $order ) .' '. $this->ordering;
		}

		if( is_integer ( $limit ) && $limit > 0 ) {
		$query .= ' LIMIT 0, '.$limit;
		}
		else if( is_string ( $limit ) ) {
		$limitlower = floor( (float)$limit );
		$limitupper = substr($limit, strpos($limit, ".") + 1);
		$query .= ' LIMIT '.$limitlower.', '.$limitupper;
		}

	$this->lastquery = $query;
	$results = @mysql_query( $query, $this->connected );

		if( !@mysql_num_rows( $results ) ) { return false; }

	$r = jarray();

		while( $rivi = mysql_fetch_assoc ( $results ) ) {
		$r->push( $rivi );
		}

	return $r;
	}
}

?>