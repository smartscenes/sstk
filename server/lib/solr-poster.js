var request = require('request'),
    config = require('../config');

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

    console.log('Posting to ' + url);
    console.log(data);

    request(options, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            if (successCallback) successCallback(body);
        } else {
            console.error("Error posting to solr: " + url);
            if (error) console.error("Error is " + error);
            var status;
            if (response) {
                console.log("Response status is " + response.statusCode);
                console.log(body);
                status = response.statuscode;
            }
            if (errorCallback) errorCallback(status, "Error submitting annotation");
        }
    });
};


