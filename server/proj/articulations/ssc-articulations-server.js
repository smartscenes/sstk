#!/usr/bin/env node

const cmd = require('commander');

var cluster = require('cluster');
// SSC rendering
var ArticulationRenderServer = require('./articulationRenderServer');

function cmdPartInt(x, accum) { return parseInt(x); }

cmd
  .version('0.0.1')
  .description('Start server for rendering articulations')
  .option('--render_dir <dirname>', 'Output rendering directory')
  .option('--workers <num>', 'Number of workers', cmdPartInt)
  .option('--port <num>', 'Port number (default 8000)', cmdPartInt, 8000)
  .option('--width <num>', 'Width (default 512)', cmdPartInt, 512)
  .option('--height <num>', 'Height (default 512)', cmdPartInt, 512)
  .parse(process.argv);

if(cluster.isMaster) {
    var numWorkers = cmd.workers || require('os').cpus().length;

    console.log('Master cluster setting up ' + numWorkers + ' workers...');
    console.log('Starting rendering server on port ' + cmd.port);

    for(var i = 0; i < numWorkers; i++) {
        cluster.fork();
    }

    cluster.on('online', function(worker) {
        console.log('Worker ' + worker.process.pid + ' is online');
    });

    cluster.on('exit', function(worker, code, signal) {
        console.log('Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
        console.log('Starting a new worker');
        cluster.fork();
    });
} else {
    var app = require('express')();
    var bodyParser = require('body-parser');
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json({
        limit: '10mb'  // Limit on size of submissions (10mb is huge!!!)
    }));
    //app.all('/*', function(req, res) {res.send('process ' + process.pid + ' says hello!').end();})

    var articulationRenderServer = new ArticulationRenderServer({
        width: cmd.width,
        height: cmd.height,
        outputDir: cmd.render_dir
    });
    app.all('/articulations/render/final', articulationRenderServer.renderArticulated.bind(articulationRenderServer));
    app.all('/articulations/render/proposed', articulationRenderServer.renderProposed.bind(articulationRenderServer));

    var server = app.listen(cmd.port, function() {
        console.log('Process ' + process.pid + ' is listening to all incoming requests');
    });
}