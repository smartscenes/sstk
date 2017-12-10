'use strict';

var _ = require('util');

var defaultConfig = {
  url: "http://localhost:9000",
  annotators: "tokenize,ssplit,lemma,pos,ner,entitymentions,depparse",
  "sutime.includeRange": "true",
  outputFormat: "json"
};

function __currentTime() {
  function f(n) {
    return n < 10 ? '0' + n : n;
  }
  var date = new Date();
  var M = date.getMonth() + 1;
  var D = date.getDate();
  var Y = date.getFullYear();
  var h = date.getHours();
  var m = date.getMinutes();
  var s = date.getSeconds();
  return "" + Y + "-" + f(M) + "-" + f(D) + "T" + f(h) + ':' + f(m) + ':' + f(s);
}

// Simple minded hookup to StanfordCoreNLP server
// Download Stanford CoreNLP from http://stanfordnlp.github.io/CoreNLP/index.html#download
// More details at: http://stanfordnlp.github.io/CoreNLP/corenlp-server.html
function CoreNLP(config) {
  config = config || {};
  this.config = _.defaults(Object.create(null), config, defaultConfig);
  this.url = this.config.url;
  delete this.config.url;
}

CoreNLP.prototype.annotate = function(text, onSuccess, onError) {
  var config = _.defaults(Object.create(null), { date: __currentTime() }, this.config);
  var params = _.param(config);
  var url =  this.url + '?' + params;
  var scope = this;
  _.post({
    url: url,
    data: text,
    success: function(annotation) {
      for (var i = 0; i < annotation.sentences.length; i++) {
        var s = annotation.sentences[i];
        if (s.parse) {
          s.parseTree = scope.convertParseStringToTree(s.parse, s.tokens);
        }
      }

      onSuccess(annotation);
    },
    error: onError
  });
};

var parenthesize = function(input, list) {
  if (list === undefined) {
    return parenthesize(input, []);
  } else {
    var token = input.shift();
    if (token === undefined) {
      return list.pop();
    } else if (token === "(") {
      list.push(parenthesize(input, []));
      return parenthesize(input, list);
    } else if (token === ")") {
      return list;
    } else {
      return parenthesize(input, list.concat(token));
    }
  }
};

var toTree = function(list) {
  if (list.length === 2 && typeof list[1] === 'string') {
    return { label: list[0], text: list[1], isTerminal: true };
  } else if (list.length >= 2) {
    var label = list.shift();
    var node = { label: label };
    var rest = list.map( function(x) { var t = toTree(x);
      if (typeof t === 'object') {
        t.parent = node;
      }
      return t;
    });
    node.children = rest;
    return node;
  } else {
    return list;
  }
};

var indexTree = function(tree, tokens, index) {
  index = index || 0;
  if (tree.isTerminal) {
    tree.token = tokens[index];
    tree.tokenIndex = index;
    return index+1;
  } else if (tree.children) {
    for (var i = 0; i < tree.children.length; i++) {
      var child = tree.children[i];
      index = indexTree(child, tokens, index);
    }
  }
  return index;
};

var tokenize = function(input) {
  return input.split('"')
    .map(function(x, i) {
      if (i % 2 === 0) { // not in string
        return x.replace(/\(/g, ' ( ')
          .replace(/\)/g, ' ) ');
      } else { // in string
        return x.replace(/ /g, "!whitespace!");
      }
    })
    .join('"')
    .trim()
    .split(/\s+/)
    .map(function(x) {
      return x.replace(/!whitespace!/g, " ");
    });
};

CoreNLP.prototype.convertParseStringToTree = function(input, tokens) {
  var p = parenthesize(tokenize(input));
  if (Array.isArray(p)) {
    var tree = toTree(p);
    // Correlate tree with tokens
    indexTree(tree, tokens);
    return tree;
  }
};

module.exports = CoreNLP;