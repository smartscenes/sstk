// Express subapp
var express = require('express');
var cors = require('cors');

var path = require('path');
var bodyParser = require('body-parser');
var app = module.exports = express();
app.use(cors());
app.use(express.static(path.join(__dirname, './static/html/')));
app.use(express.static(path.join(__dirname, './static/')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());

app.set('views', __dirname + '/views');
app.set('view engine', 'pug');

var dbConfig = {
  host: 'localhost',
  user: 'articulations',
  password: 'articulate',
  database: 'articulations'
};
var SQLArticulationAnnotationDb = require('./lib/sqlArticulationAnnotationDb');
var artnAnnDb = new SQLArticulationAnnotationDb(dbConfig);

var SQLVerificationViewerDb = require('./lib/sqlVerificationViewerDb');
var verificationDb = new SQLVerificationViewerDb(dbConfig);

var MotionAnnotatorServer = require('./motionAnnotatorServer');
var motionAnnotatorServer = new MotionAnnotatorServer({
  // MotionAnnotator
  sqlDB: artnAnnDb,
  numSimComputeThreads: 4,
  nextSuggestionQueue: []
});

var VerificationServer = require('./verificationServer');
var verificationServer = new VerificationServer({
  sqlDB: verificationDb,
  numSimComputeThreads: 4,
  nextSuggestionQueue: []
});

app.get('/motion-annotator', motionAnnotatorServer.getAnnotator.bind(motionAnnotatorServer));
app.get('/articulation-annotations/list', motionAnnotatorServer.listAnnotations.bind(motionAnnotatorServer));
app.get('/articulation-annotations/load-annotations', motionAnnotatorServer.loadAnnotations.bind(motionAnnotatorServer));
app.post('/articulation-annotations/submit-annotations', motionAnnotatorServer.submitAnnotations.bind(motionAnnotatorServer));

// Loads a specific existing auto-annotation. The app currently doesn't use this.
app.get('/grouped-motion-annotations', function (req, res) { res.render('grouped-motion-annotations', { assetGroupName: req.query['assetGroup'] }) });

// Verification Interface
app.get('/verification-viewer/filters/object-category', verificationServer.getObjectCategories.bind(verificationServer));
app.get('/verification-viewer/filters/part-labels', verificationServer.getPartLabels.bind(verificationServer));
app.get('/verification-viewer/filters/program-names', verificationServer.getProgramNames.bind(verificationServer));
app.post('/verification-viewer/load', verificationServer.getData.bind(verificationServer));
app.get('/verification-viewer/objects', verificationServer.getObjects.bind(verificationServer));
app.get('/verification-viewer/object/parts', verificationServer.getPartsForObject.bind(verificationServer));
app.get('/verification-viewer/parts/grouped', verificationServer.getPartsGroupedByLabel.bind(verificationServer));
app.get('/verification-viewer/parts/count', verificationServer.getNumberOfParts.bind(verificationServer));
app.get('/verification-viewer/part/render-hash', verificationServer.getRenderHashForPart.bind(verificationServer));

// Articulation rendering to Database interfacing
app.get('/render/hash', verificationServer.getHashforArticulations.bind(verificationServer));
app.post('/render/hash', verificationServer.updateHashforArticulations.bind(verificationServer));

// Annotation Program List
app.get('/articulation-get-programs', verificationServer.getPrograms.bind(verificationServer));
app.post('/articulation-add-program', verificationServer.addProgram.bind(verificationServer));
app.post('/articulation-delete-program', verificationServer.deleteProgram.bind(verificationServer));
app.post('/articulation-rename-program', verificationServer.renameProgram.bind(verificationServer));
app.post('/articulation-duplicate-program', verificationServer.duplicateProgram.bind(verificationServer));

// Annotation Program Editor
app.get('/articulation-get-program-motion-identification-rules', verificationServer.getMotionIdentificationRules.bind(verificationServer));
app.get('/articulation-get-program-motion-parameter-rules', verificationServer.getMotionParameterRules.bind(verificationServer));
app.post('/articulation-set-program-motion-identification-rules', verificationServer.setMotionIdentificationRules.bind(verificationServer));
app.post('/articulation-set-program-motion-parameter-rules', verificationServer.setMotionParameterRules.bind(verificationServer));
app.get('/articulation-get-program-metadata', verificationServer.getProgramMetadata.bind(verificationServer));

// Articulation Inspector
app.get('/articulation-inspector', verificationServer.getArticulationInspector.bind(verificationServer));
app.get('/get-part-information', verificationServer.getPartInformation.bind(verificationServer));
