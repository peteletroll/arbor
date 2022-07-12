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
  },
  extend:function(dst, src){
    console.log("HERMETIC extend()");
    if (typeof src!='object') return dst
    
    for (var k in src){
      if (src.hasOwnProperty(k)) dst[k] = src[k]
    }
    
    return dst
  },
  inArray:function(elt, arr){
    console.log("HERMETIC inArray()");
    return arr.findIndex(e => e === elt);
  },
  isEmptyObject:function(obj){
    console.log("HERMETIC isEmptyObject()");
    if (typeof obj!=='object') return false
    var isEmpty = true
    $.each(obj, function(k, elt){
      isEmpty = false
    })
    return isEmpty
  }
}
