/**
 * Interface for search
 * @interface
 * @memberOf search
 */
function SearchModule() {
}

SearchModule.facetOrderCount = 'count';
SearchModule.facetOrderIndex = 'index';

/**
 * Faceted search for a field with error first callback
 * @param params Facet search parameters
 * @param params.facetField {string} Field to facet on (ex: 'category')
 * @param [params.facetSort] {string} How to sort the results
 * @param [params.facetLimit=-1] {int} Number of facet results to return
 * @param [params.facetMinCount=0] {int} Minimum number of results for that facet to be returned
 * @param [params.url=this.url] {string} Search url
 * @param [params.query=*:*] {string} Query string
 * @param [params.filter] {string} Additional filter (ex: '+datasets:ShapeNet')
 * @param callback Error first callback
 */
SearchModule.prototype.facetFieldSearch = function (params, callback) {
};

/**
 * Execute basic query
 * @param params Query parameters
 * @param [params.url=this.url] {string} Search url
 * @param [params.query=*:*] {string} Query
 * @param [params.start=0] {int} Record to start at
 * @param [params.limit=0] {int} Limit on number of records to fetch
 * @param [params.sort] {string} Sort order
 * @param [params.fields] {string} Fields to return
 * @param [params.filter] {string} Additional solr filter (ex: '+datasets:ShapeNet')
 * @param callback
 */
SearchModule.prototype.query = function (params, callback) {
};

/**
 * Retrieves statistics for a field with error first callback
 * @param [params.url=this.url] {string} Search url
 * @param [params.query=*:*] {string} Query string
 * @param [params.filter] {string} Additional filter (ex: '+datasets:ShapeNet')
 * @param params.field {string} Field to get statistics on
 * @param callback Error first callback
 */
SearchModule.prototype.getStats = function (params, callback) {

};

/**
 * Lookup queriable fields and their types
 * @param params.url Url for looking up fields
 * @param callback Error first callback
 */
SearchModule.prototype.lookupFields = function (params, callback) {
};
