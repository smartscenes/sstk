/**
 * Interface for solrQueryProxy
 * @interface
 * @memberOf search
 */
function SolrQueryProxy() {
}

SolrQueryProxy.prototype = Object.create(Object.prototype);
SolrQueryProxy.prototype.constructor = SolrQueryProxy;


/**
 * Execute solr query
 */
SolrQueryProxy.prototype.query = function (solrUrl, queryData, callback) {
}

module.exports = SolrQueryProxy;