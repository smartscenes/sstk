const SolrQueryProxy = require('search/SolrQueryProxy');
const _ = require('util/util');

class WizardSolrQueryProxy extends SolrQueryProxy {
    constructor(params) {
        super();
        this.timeout = params.timeout;
        this.endpointUrl = params.endpointUrl;
        this.__sortStrategy = (params.sortStrategy === undefined) ? 'direct' : params.sortStrategy;
        this.selectedMask = null;
        this.enabled = true;
    }

    get sortStrategy() {
        return this.__sortStrategy;
    }

    set sortStrategy(v) {
        console.assert(['direct', 'lfd'].includes(v));
        this.__sortStrategy = v;
    }

    get isActive() {
        return this.enabled && this.selectedMask != null && this.sortStrategy !== 'direct';
    }

    query(solrUrl, queryData, callback) {
        // Prepare request
        const dropFields = ['start', 'rows', 'wt'];
        if (this.sortStrategy === 'lfd') {
            dropFields.push('sort');
        }
        const solrArgs = _.omit(queryData, dropFields);

        const URL_PREFIX = '/solr/';
        const URL_SUFFIX = '/select';
        // console.assert(solrUrl.endsWith(URL_SUFFIX));
        // console.assert(solrUrl.startsWith(URL_PREFIX));
        const solrCore = solrUrl.substr(URL_PREFIX.length, solrUrl.length - URL_SUFFIX.length -  URL_PREFIX.length);

        let mask = null;
        if (this.selectedMask) {
            mask = {
                "mask_id": this.selectedMask.maskId.toString(),
                "full_panorama_id": this.selectedMask.photoId
            };
        }

        const modifiedQueryData = {
            "solr_args": solrArgs,
            "solr_core": solrCore,
            "start": queryData.start,
            "rows": queryData.rows,
            "sort_strategy": this.sortStrategy,
            "mask": mask
        };

        console.log({"Shape Suggester Query": modifiedQueryData });

        // Request
        const timeout = this.timeout;
        return _.ajax({
            url: this.endpointUrl,
            type: "POST",
            data: JSON.stringify(modifiedQueryData),
            contentType: "application/json",
            dataType: "json",
            callback: callback,
            timeout: timeout
        });
    }

}

module.exports = WizardSolrQueryProxy;
  