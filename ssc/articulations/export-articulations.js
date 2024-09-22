#!/usr/bin/env node

/* jshint esversion: 6 */
const VERSION = '0.0.1';
const STK = require('../stk-ssc');
const _ = STK.util;
const cmd = require('commander');
cmd
    .version(VERSION)
    .description('Export articulations as json files')
    .option('--id <id>', 'Model id')
    .option('--source <source>', 'Model source')
    .option('--annotation_filename <filename>', 'Annotations filename')
    .option('--precomputed_filename <filename>', 'Precomputed connectivity filename')
    .option('--output <filename>', 'Output filename')
    .parse(process.argv);

const ArticulationAnnotationsLoader = STK.articulations.ArticulationAnnotationsLoader;

function exportArticulations(annotation_filename, precomputed_filename, output_filename) {
    ArticulationAnnotationsLoader.loadArticulationAnnotations(annotation_filename, precomputed_filename, function(err, res) {
        if (err) {
            console.error(`Error loading parts model=${annotation_filename} parts=${precomputed_filename}`, err);
        } else {
            const articulations = res.articulations.data.articulations;
            if (res.precomputed) {
                const connectivityGraph = STK.parts.PartConnectivityGraph.fromJson(res.precomputed);
                const reducedConnectivityGraph = connectivityGraph.clone();
                reducedConnectivityGraph.cutExtraConnections(articulations);
                res.precomputed.reducedConnectivityGraph = reducedConnectivityGraph.connectivityAsArray();
                STK.fs.writeToFile(output_filename + '.artpost.json', JSON.stringify(res.precomputed));
            }
            STK.fs.writeToFile(output_filename + '.articulations.json', JSON.stringify(articulations));
        }
    });
}

function exportArticulationsWithId(source, id, output_filename) {
    const modelId = `${source}.${id}`;
    const annotation_filename = `${STK.Constants.baseUrl}/articulation-annotations/load-annotations?modelId=${modelId}`;
    const precomputed_filename = (cmd.precomputed_filename === 'none' || cmd.precomputed_filename == null)?
      "none" : `${STK.Constants.baseUrl}/articulations/${source}/precomputed/${modelId}.artpre.json`;
    if (output_filename == null) {
        output_filename = `${modelId}`;
    }
    exportArticulations(annotation_filename, precomputed_filename, output_filename);
}

if (cmd.precomputed_filename != null && cmd.annotation_filename != null) {
    exportArticulations(cmd.annotation_filename, cmd.precomputed_filename, cmd.output_filename);
} else {
    exportArticulationsWithId(cmd.source, cmd.id, cmd.output);
}
