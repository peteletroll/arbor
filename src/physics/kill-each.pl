#!/usr/bin/perl

use strict;
use warnings;

# $.each(active.springs, function(id, spring){
#   spring.k = stiff
# })             

local $/ = undef;
while (<>) {
	s{
		\$\.each\(
		\s*
		([\w\.]+) \s*, \s*
		function \s* \( \s*
		(\w+) \s* , \s* (\w+) \s*
		\) \s* \{
		\s* \n ([^\S\n]*)
	}
	{
		my ($obj, $key, $val, $ind) = ($1, $2, $3, $4);
		"for ($key in $obj) \{ // WAS-EACH\n"
			. "${ind}var $val = $obj\[$key\];\n"
			. "$ind"
	}ex;
	print;
}

