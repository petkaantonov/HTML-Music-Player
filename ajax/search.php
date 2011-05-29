<?php
header( "Content-Type: application/json; charset=utf-8" );
require '../includes/class_FastQuery.php';

function appendstar( $str ) {
return $str."*";
}

$query = $_GET['query'];

$query = preg_replace('/[^A-Za-z0-9\s]+/', '', preg_replace('/\s{2,/', ' ', $query) );

	if( !$query ) { 
	echo json_encode(array("error" => true));
	exit();
	}
$words = explode( " ", $query );
$wildcard = implode( " ", array_map( "appendstar", $words ) );

$buildrelevance = array();

	foreach( $words as $word ) {
	array_push( $buildrelevance, "((length(title) - length(replace(LOWER(title), LOWER('$word'), ''))) / length('$word'))" );
	}

$relquery = implode( " + ", $buildrelevance );
$sqlquery = 	"SELECT url, title, $relquery as purkka, (length(title) - length(replace(LOWER(CONCAT(' ',title, ' ')), LOWER(' $query '), ''))) as exactmatch FROM mp3searchindex WHERE MATCH(url, title) AGAINST('$query') " .
		"UNION " .
		"SELECT url, title, $relquery as purkka, (length(title) - length(replace(LOWER(CONCAT(' ',title, ' ')), LOWER(' $query '), ''))) as exactmatch FROM mp3searchindex WHERE MATCH(url, title) AGAINST('$wildcard' IN BOOLEAN MODE) ".
		"ORDER BY exactmatch DESC, purkka DESC LIMIT 0, 100";


$results = $db -> custom( $sqlquery );

	if( !$results ) {
	exit( json_encode( array() ) );
	
	}

echo json_encode( $results -> toPhpArray() );
?>