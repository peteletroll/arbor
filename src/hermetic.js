//
// hermetic.js
//
// the parts of jquery i can't live without (e.g., while in a web worker)
//
$ = {
  each:function(obj, callback){
    if (Array.isArray(obj))
	  throw "HERMETIC each(Array)";
    console.log("HERMETIC each(Object)");
    if (Array.isArray(obj)){
      for (var i=0, j=obj.length; i<j; i++) callback(i, obj[i])
    }else{
      for (var k in obj) callback(k, obj[k])
    }
  },
  map:function(arr, fn){
    console.log("HERMETIC map()");
    var out = []
    $.each(arr, function(i, elt){
      var result = fn(elt)
      if (result!==undefined) out.push(result)
    })
    return out
  }
}
