// Bundle in Crockford's JSON2.js
var JSON;JSON||(JSON={});
(function(){function k(a){return a<10?"0"+a:a}function o(a){p.lastIndex=0;return p.test(a)?'"'+a.replace(p,function(a){var c=r[a];return typeof c==="string"?c:"\\u"+("0000"+a.charCodeAt(0).toString(16)).slice(-4)})+'"':'"'+a+'"'}function l(a,j){var c,d,h,m,g=e,f,b=j[a];b&&typeof b==="object"&&typeof b.toJSON==="function"&&(b=b.toJSON(a));typeof i==="function"&&(b=i.call(j,a,b));switch(typeof b){case "string":return o(b);case "number":return isFinite(b)?String(b):"null";case "boolean":case "null":return String(b);case "object":if(!b)return"null";
e+=n;f=[];if(Object.prototype.toString.apply(b)==="[object Array]"){m=b.length;for(c=0;c<m;c+=1)f[c]=l(c,b)||"null";h=f.length===0?"[]":e?"[\n"+e+f.join(",\n"+e)+"\n"+g+"]":"["+f.join(",")+"]";e=g;return h}if(i&&typeof i==="object"){m=i.length;for(c=0;c<m;c+=1)typeof i[c]==="string"&&(d=i[c],(h=l(d,b))&&f.push(o(d)+(e?": ":":")+h))}else for(d in b)Object.prototype.hasOwnProperty.call(b,d)&&(h=l(d,b))&&f.push(o(d)+(e?": ":":")+h);h=f.length===0?"{}":e?"{\n"+e+f.join(",\n"+e)+"\n"+g+"}":"{"+f.join(",")+
"}";e=g;return h}}if(typeof Date.prototype.toJSON!=="function")Date.prototype.toJSON=function(){return isFinite(this.valueOf())?this.getUTCFullYear()+"-"+k(this.getUTCMonth()+1)+"-"+k(this.getUTCDate())+"T"+k(this.getUTCHours())+":"+k(this.getUTCMinutes())+":"+k(this.getUTCSeconds())+"Z":null},String.prototype.toJSON=Number.prototype.toJSON=Boolean.prototype.toJSON=function(){return this.valueOf()};var q=/[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
p=/[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,e,n,r={"\u0008":"\\b","\t":"\\t","\n":"\\n","\u000c":"\\f","\r":"\\r",'"':'\\"',"\\":"\\\\"},i;if(typeof JSON.stringify!=="function")JSON.stringify=function(a,j,c){var d;n=e="";if(typeof c==="number")for(d=0;d<c;d+=1)n+=" ";else typeof c==="string"&&(n=c);if((i=j)&&typeof j!=="function"&&(typeof j!=="object"||typeof j.length!=="number"))throw Error("JSON.stringify");return l("",
{"":a})};if(typeof JSON.parse!=="function")JSON.parse=function(a,e){function c(a,d){var g,f,b=a[d];if(b&&typeof b==="object")for(g in b)Object.prototype.hasOwnProperty.call(b,g)&&(f=c(b,g),f!==void 0?b[g]=f:delete b[g]);return e.call(a,d,b)}var d,a=String(a);q.lastIndex=0;q.test(a)&&(a=a.replace(q,function(a){return"\\u"+("0000"+a.charCodeAt(0).toString(16)).slice(-4)}));if(/^[\],:{}\s]*$/.test(a.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,"@").replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,
"]").replace(/(?:^|:|,)(?:\s*\[)+/g,"")))return d=eval("("+a+")"),typeof e==="function"?c({"":d},""):d;throw new SyntaxError("JSON.parse");}})();

var turk;
turk = turk || {};

(function() {
  if (!Array.prototype.map) {
    Array.prototype.map = function(fun /*, thisp*/) {
      var len = this.length >>> 0;
      if (typeof fun != "function") { throw new TypeError(); }

      var res = new Array(len);
      var thisp = arguments[1];
      for (var i = 0; i < len; i++) {
        if (i in this)
          res[i] = fun.call(thisp, this[i], i, this);
   		}
      return res;
    };
  }

  
  var hopUndefined = !Object.prototype.hasOwnProperty,
      showPreviewWarning = true;
  
  // We can disable the previewWarning by including this script with "nowarn" in the script url
  // (i.e. mmturkey.js?nowarn). This doesn't work in FF 1.5, which doesn't define document.scripts
  if (document.scripts) {
    for(var i=0, ii = document.scripts.length; i < ii; i++ ) {
      var src = document.scripts[i].src;
      if ( /mmturkey/.test(src) && /\?nowarn/.test(src) ) {
        showPreviewWarning = false;
        break;
      }
    }
  }
  
  var param = function(url, name ) {
    name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
    var regexS = "[\\?&]"+name+"=([^&#]*)";
    var regex = new RegExp( regexS );
    var results = regex.exec( url );
    return ( results == null ) ? "" : results[1];
  }
  
  function getKeys(obj) {
    var a = [];
    for(var key in obj) {
      if ((hopUndefined || obj.hasOwnProperty(key)) && (typeof obj[key] != "function") ) {
        a.push(key);
      }
    }
    return a;
  }
  
  // warning: Object.keys() is no good in older browsers
  function isTable(array,equality) {
  	if (!(array instanceof Array)) {
  		return false;
  	}
  	
  	// if the array contains a non-Object, bail
  	if (array.reduce(function(acc,x) { return !(x instanceof Object) || acc },false)) {
  	  return false;
  	}

  	if (equality == "loose") {
  		return array.reduce(function(a,x) {
  			return a && typeof x == "object"
  		},true);
  	}
  	
    var arraysEqual = function(a,b) {
    	var i = a.length;
    	if (b.length != i) {
    		return false;
    	}
    	while(i--) {
    		if (a[i] != b[i]) {
    			return false;
    		}
    	}
    	return true;	
    }    

  	var keys = getKeys(array[0]);

  	return array.reduce(function(a,x) {
  		return a && arraysEqual(keys,getKeys(x));
  	},true);
  }
  
  var htmlifyTable = function(array) {
    var getRow = function(obj) {
      var str = "";
      str += "<tr>";
      str += keys.map(function(k) { return "<td>" + obj[k] + "</td>" }).join("\n");
      str += "</tr>";
      return str;
    }
    
    var keys = getKeys(array[0]);
    
    var str = "";
    str += "<span title='tabular representation of array of objects with the same set of keys'>";
    str += "<table border='1' style='border-collapse: collapse' cellpadding='3'>"
    str += "<tr>";
      str += keys.map(function(k) { return "<th>" + k + "</th>" }).join("\n");
    str += "</tr>";
    str += array.map(getRow).join("\n");
    str += "</table></span>";
    
    return str;
  }
  
  // Give an HTML representation of an object
  var htmlify = function(obj) {
    // Disabled for now, as this doesn't work for tables embedded within tables
    /*if (isTable(obj)) {
      return htmlifyTable(obj);
    } else */
    if (obj instanceof Array) {
      return "[" + obj.map(function(o) { return htmlify(o) } ).join(",") + "]";
    } else if (typeof obj == "object") {
      var strs = [];
      for(var key in obj) {
        if (obj.hasOwnProperty(key)) {
          var str = "<li>" + htmlify(key) + ": " + htmlify(obj[key]) + "</li>";
          strs.push(str);
        }
      }
      return "{<ul>" + strs.join("") + "</ul>}";
    } else if (typeof obj == "string")  {
      return '"' + obj + '"';
    } else if (typeof obj == "undefined" ) {
      return "[undefined]"
    } else {
      return obj.toString();
    }
  };
  
  var addFormData = function(form,key,value) {
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = value;
    form.appendChild(input);
  }

  var url = window.location.href,
      src = param(url, "assignmentId") ? url : document.referrer,
      keys = ["assignmentId","hitId","workerId","turkSubmitTo"];
  
  keys.map(function(key) {
    turk[key] = unescape(param(src, key));
  });

  turk.previewMode = (turk.assignmentId == "ASSIGNMENT_ID_NOT_AVAILABLE");

  // Submit a POST request to Turk
  turk.submit = function(object, unwrap) {
    var keys = getKeys(object);
    
    if (typeof object == "undefined" || keys.length == 0) {
      alert("mmturkey: you need to pass an object (i.e., actual data) to turk.submit() ");
      return;
    }
    
    unwrap = !!unwrap;
    
    var assignmentId = turk.assignmentId,
        turkSubmitTo = turk.turkSubmitTo,
        rawData = {},
        form = document.createElement('form');
   
    document.body.appendChild(form);
    
    if (assignmentId) {
      rawData.assignmentId = assignmentId;
      addFormData(form,"assignmentId",assignmentId);
    }
    
    if (unwrap) {
      // Filter out non-own properties and things that are functions
      keys.map(function(key) {
        rawData[key] = object[key];
        addFormData(form, key, JSON.stringify(object[key]));
      });
      
    } else {
      rawData["data"] = object;
      addFormData(form, "data", JSON.stringify(object));
    }

    // If there's no turk info
    if (!assignmentId || !turkSubmitTo) {
      // Emit the debug output and stop
      var div = document.createElement('div'),
          style = div.style;
      style.fontFamily = '"HelveticaNeue-Light", "Helvetica Neue Light", "Helvetica Neue", sans-serif';
      style.fontSize = "14px";
      style.cssFloat = "right";
      style.padding = "1em";
      style.backgroundColor = "#dfdfdf";
      div.innerHTML = "<p><b>Debug mode</b></p>Here is the data that would have been submitted to Turk: <ul>" + htmlify(rawData) + "</ul>";
      div.className = "mmturkey-debug";
      document.body.appendChild(div);
      return;
    }

    // Otherwise, submit the form
    form.action = turk.turkSubmitTo + "/mturk/externalSubmit";
    form.method = "POST";
    form.submit();
  }
  
  // simulate $(document).ready() to show the preview warning
  if (showPreviewWarning && turk.previewMode) {
    var intervalHandle = setInterval(function() {
      try {
        var div = document.createElement('div'),
            style = div.style;
        style.backgroundColor = "gray";
        style.color = "white";
        
        style.position = "absolute";
        style.margin = "0";
        style.padding = "0";
        style.paddingTop = "15px";
        style.paddingBottom = "15px";
        style.top = "0";
        style.width = "98%";
        style.textAlign = "center";
        style.fontFamily = "arial";
        style.fontSize = "24px";
        style.fontWeight = "bold";
        
        style.opacity = "0.5";
        style.filter = "alpha(opacity = 50)";
        
        div.innerHTML = "PREVIEW MODE: CLICK \"ACCEPT\" ABOVE TO START THIS HIT";
        
        document.body.appendChild(div);
        clearInterval(intervalHandle);
      } catch(e) {
        
      }
    },20);
  }
  
})();