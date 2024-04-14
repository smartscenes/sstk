var request = require('request');
var log = require('../lib/logger')('solr-poster');

exports.addSolrRecord = function(url, record, successCallback, errorCallback) {
    var solrCommands = {
        "add": { "doc": record },
        "commit": {}
    };
    // Assumes that stringify will stringify so commit comes after add
    var data = JSON.stringify(solrCommands);
    exports.postToSolrData(url, data, successCallback, errorCallback);
};

exports.addSolrRecords = function(url, records, successCallback, errorCallback) {
    var data = '{';
    for (var i = 0; i < records.length; i++) {
        data = data + '\n"add": { "doc":'+ JSON.stringify(records[i]) + '}, ';
    }
    data = data + '\n"commit": {} ';
    data = data + '\n}';
    exports.postToSolrData(url, data, successCallback, errorCallback);
};

exports.updateSolrRecords = function(url, records, successCallback, errorCallback) {
    var data = JSON.stringify(records);
    exports.postToSolrData(url + '?commit=true', data, successCallback, errorCallback);
};

exports.postToSolrData = function(url, data, successCallback, errorCallback) {
    var options = {
        url: url,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: data
    };

    log.info('Posting to ' + url, data);

    request(options, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            if (successCallback) successCallback(body);
        } else {
            log.error("Error posting to solr: " + url, error);
            var status = 500;
            if (response && response.statusCode != undefined) {
                log.info("Response status is " + response.statusCode, body);
                status = response.statusCode;
            }
            if (errorCallback) errorCallback(status, "Error submitting annotation");
        }
    });
};


