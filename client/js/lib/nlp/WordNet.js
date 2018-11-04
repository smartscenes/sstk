var Constants = require('Constants');
var SolrQuerier = require('search/SolrQuerier');
var _ = require('util/util');

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
    taxonomy: 'wordnet',
    limit: 10000
  };
  opts = _.defaults(Object.create(null), opts || {}, defaults);
  if (opts.wordnetVersion === '3.0') {
    this.__wnSynsetId = 'wn30synsetid';
    this.__wnSynsetKey = 'wn30synsetkey';
  } else if (opts.wordnetVersion === '3.1') {
    this.__wnSynsetId = 'wn31synsetid';
    this.__wnSynsetKey = 'wn31synsetkey'; // TODO: Not yet populated
  }
  this.solrQuerier = new SolrQuerier({
    url: opts.solrUrl,
    limit: opts.limit
  });
  this.__taxonomyUrl = Constants.taxonomyUrl;
  this.__taxonomyName = opts.taxonomy;
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
 * @param callback {nlp.WordNet.synsetsCallback} Callback function that provides the synsets matching the query
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
  this.query(solrQuery, callback);
};

/**
 * Lookup synsets by specific fields
 * @param fieldname {string} Fieldname
 * @param values {string|string[]} Values to lookup
 * @param callback {nlp.WordNet.synsetsCallback} Callback function that provides the synsets matching the query
 */
WordNet.prototype.lookupByField = function(fieldname, values, callback) {
  var solrQuery = this.solrQuerier.getQuery(fieldname, values, 'quote');
  this.query(solrQuery, callback);
};

/**
 * Performs a query
 * @param solrQuery {string}
 * @param callback  {nlp.WordNet.synsetsCallback} Callback function that provides the synsets matching the query
 */
WordNet.prototype.query = function(solrQuery, callback) {
  var synsetkey = this.__wnSynsetKey;
  this.solrQuerier.query({ query: solrQuery }, function(err, data) {
    if (!err) {
      // Convert from solr response to synset info
      var docs = data.response.docs;
      if (docs) {
        _.each(docs, function(d) {
          if (_.isArray(d[synsetkey])) {
            d[synsetkey] = d[synsetkey][0];
          }
        });
      }
      callback(null, docs);
    } else {
      callback(err, null);
    }
  });
};

/**
 * Query for taxonony information for node
 * @param synsets {string[]|nlp.WordNet.Synset[]}
 * @param callback  {nlp.WordNet.taxonomyNodeIdsCallback} Callback function that provides the taxonomy synset ids
 */
WordNet.prototype.getTaxonomyNodeIds = function(synsets, callback) {
  if (!_.isArray(synsets)) { synsets = [synsets]; }
  var synsetIds = _.map(synsets, function(synset) { return _.isString(synset)? synset : synset.synsetid; });
  var url = this.__taxonomyUrl + '?' + _.param({tax: this.__taxonomyName, relatives: true, n: synsetIds.join(',') });
  _.getJSON(url, callback);
};

/**
 * Query for taxonony information for node
 * @param synsets {string[]|nlp.WordNet.Synset[]}
 * @param callback  {nlp.WordNet.taxonomyNodesCallback} Callback function that provides the taxonomy synsets
 */
WordNet.prototype.getTaxonomyNodes = function(synsets, callback) {
  var scope = this;
  this.getTaxonomyNodeIds(synsets, function(err, taxNodes) {
    if (taxNodes) {
      //console.log(taxNodes);
      var synsetIds = _.flatMap(taxNodes, function(taxNode) {
        var sids = [taxNode.id];
        sids = _.concat(sids, taxNode.ancestors || [], taxNode.children || []);
        sids = _.uniq(sids);
        return sids;
      });
      synsetIds = _.uniq(synsetIds);
      scope.lookupByField('synsetid', synsetIds, function(err, infos) {
        if (infos) {
          var synsetsById = _.keyBy(infos, 'synsetid');
          var taxNodeSynsets = _.map(taxNodes, function(taxNode) {
            var synset = synsetsById[taxNode.id];
            if (!synset) {
              console.warn('No synset for ', taxNode.id);
            }
            return {
              synset: synset,
              children: taxNode.children? _.filter(_.map(taxNode.children, function(id) { return synsetsById[id]; })) : undefined,
              parents: taxNode.parents? _.filter(_.map(taxNode.parents, function(id) { return synsetsById[id]; })) : undefined,
              ancestors: taxNode.ancestors? _.filter(_.map(taxNode.ancestors, function(id) { return synsetsById[id]; })) : undefined
            };
          });
          callback(null, taxNodeSynsets);
        } else {
          callback(err, null);
        }
      });
    } else {
      callback(err, null);
    }
  });
};

/**
 * Callback for WordNet.synsets
 * @callback WordNet.synsetsCallback
 * @memberof nlp
 * @param {err} Error
 * @param {nlp.Synset[]} Array of synsets.
 */

/**
 * Callback for WordNet.getTaxonomyNodeIds
 * @callback WordNet.taxonomyNodeIdsCallback
 * @memberof nlp
 * @param {err} Error
 * @param {nlp.WordNet.SynsetTaxonomyNodeWithIds[]} Array of taxonomy nodes.
 */

/**
 * Callback for WordNet.getTaxonomyNodes
 * @callback WordNet.taxonomyNodesCallback
 * @memberof nlp
 * @param {err} Error
 * @param {nlp.WordNet.SynsetTaxonomyNode[]} Array of taxonomy nodes.
 */

/**
 * Information about a synset.
 * @typedef WordNet.Synset
 * @type {object}
 * @property {string} gloss
 * @property {string} wn30synsetkey
 * @property {string} wn30synsetid
 * @memberOf nlp
 */

/**
 * Information about a synset place in a taxonomy (using ids only).
 * @typedef WordNet.SynsetTaxonomyNodeWithIds
 * @type {object}
 * @property {string} id
 * @property {string[]} children
 * @property {string[]} parents
 * @property {string[]} ancestors
 * @memberOf nlp
 */

/**
 * Information about a synset place in a taxonomy (using synsets).
 * @typedef WordNet.SynsetTaxonomyNode
 * @type {object}
 * @property {nlp.WordNet.Synset} id
 * @property {nlp.WordNet.Synset[]} children
 * @property {nlp.WordNet.Synset[]} parents
 * @property {nlp.WordNet.Synset[]} ancestors
 * @memberOf nlp
 */

module.exports = WordNet;