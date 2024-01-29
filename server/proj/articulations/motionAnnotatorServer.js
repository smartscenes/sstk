const _ = require('lodash');
const config = require('../../config');

let MotionAnnotatorServer = function (params) {
    this.db = params.sqlDB;
};

MotionAnnotatorServer.prototype.getAnnotator = function (req, res) {
    let modelId = req.query['modelId'];

    res.render('motion-annotator', {
        title: 'Articulation Annotator',
        modelId: modelId
    });
};

MotionAnnotatorServer.prototype.listAnnotations = function (req, res) {
    let queryParams = _.defaults({}, req.body, req.query);
    let format = queryParams.format;
    if (format === 'json') {
        // Query general annotations table for a summary of segment annotations
        this.__listAnnotationsJson(req, res);
    } else {
        res.render('motion-annotations', {
            ajaxOptions: {
                url: config.baseUrl + req.path + '?format=json',
                groupBy: queryParams['$groupBy'],
                data: queryParams,
                dataSrc: ''
            }
        });
    }
};

MotionAnnotatorServer.prototype.__listAnnotationsJson = function (req, res) {
    try {
        this.db.listAnnotations(req.query, (err, result) => {
            if (err) {
                console.error(err);
                res.status(400).send('Annotations not found');
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading model annotations.');
    }
};

MotionAnnotatorServer.prototype.loadAnnotations = function (req, res) {
    let modelId = req.query['modelId'];

    try {
        this.db.loadAnnotation(modelId, (err, result) => {
            if (err) {
                console.error(err);
                res.status(400).send('Annotations not found');
            } else if (result.length === 0) {
                res.status(400).send('Annotations not found.');
            } else {
                //console.log(result);
                let record = result[result.length - 1];
                record.data = JSON.parse(record.data);
                res.status(200).send(record);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading model annotations.');
    }
};

MotionAnnotatorServer.prototype.submitAnnotations = function (req, res) {
    const modelId = req.body['modelId'];
    const annotation = req.body;

    console.log(annotation);

    try {
        this.db.saveAnnotation(modelId, annotation, (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).send('Annotations could not be saved.');
            } else {
                res.status(200).send('Annotations saved.');
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Annotations could not be saved.');
    }
};

module.exports = MotionAnnotatorServer;
