var Constants = require('Constants');
var SolrQuerier = require('search/SolrQuerier');
var _ = require('util');

/**
 * WordNet interface that uses Solr to query for WordNet items.
 *
 * Try to mirror ntlk wordnet API (but uses callback to return results)
 *  http://www.nltk.org/howto/wordnet.html
 *
 * Currently we hookup to solr for search
 * In the future, we can hookup to a different webservice
 *  (maybe one that just uses nltk)
 *
 * @param opts Configuration parameters
 * @param [opts.solrUrl=Constants.wordnetSearchUrl] {string} Solr Url for accesing WordNet
 * @param [opts.wordnetVersion=3.0] {string} What wordnet version to use (3.0 or 3.1)
 * @param [opts.limit=100] {int} Limit on the number of synsets to fetch
 * @constructor
 * @memberof nlp
 */
function WordNet(opts) {
  var defaults = {
    wordnetVersion: '3.0',
    solrUrl: Constants.wordnetSearchUrl,
    limit: 100
  };
  opts = _.defaults(Object.create(null), opts || _, defaults);
  if (opts.wordnetVersion === 3.0) {
    this.__wnSynsetId = 'wn30synsetid';
    this.__wnSynsetKey = 'wn30synsetkey';
  } else if (opts.wordnetVersion === 3.1) {
    this.__wnSynsetId = 'wn31synsetid';
    this.__wnSynsetKey = 'wn31synsetkey'; // TODO: Not yet populated
  }
  this.solrQuerier = new SolrQuerier({
    url: opts.solrUrl,
    limit: opts.limit
  });
}

var posCodeToPos = {
  'n': 'noun',
  'v': 'verb',
  'a': 'adjective',
  'r': 'adverb'
};

/**
 * Looks up matching synsets in WordNet
 * @param query {string} The query can be a synset key (bed.n.01), 
 *    a word with it's part of speech (bed.n), or just the word itself (bed)
 * @param callback {synsetsCallback} Callback function that provides the synsets matching the query
 */
WordNet.prototype.synsets = function(query, callback) {
  var parts = query.split('.');
  var solrQuery;
  if (parts.length >= 3) {
    // Query by synset key
    solrQuery = this.solrQuerier.getQuery(this.__wnSynsetKey, query, 'quote');
  } else if (parts.length === 2) {
    // Query by word and pos
    solrQuery = this.solrQuerier.getCompoundQuery('AND',
      { field: 'words', value: parts[0], escape: 'quote' },
      { field: 'pos', value: posCodeToPos[parts[1]] });
  } else {
    solrQuery = this.solrQuerier.getQuery('words', query, 'quote');
  }
  this.solrQuerier.query({ query: solrQuery }, function(err, data) {
    if (!err) {
      // Convert from solr response to synset info
      callback(null, data.response.docs);
    } else {
      callback(err, null);
    }
  });
};

/**
 * Callback for WordNet.synsets
 * @callback synsetsCallback
 * @memberof nlp
 * @param {err} Error
 * @param {Object[]} Array of synsets.
 */

module.exports = WordNet;