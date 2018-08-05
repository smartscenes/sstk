#!/usr/bin/env node

/* jshint esversion: 6 */
var path = require('path');
var shell = require('shelljs');

// TODO(MS): Parse config file to specify versions of datasets to use
var METADATA = {
  'VER': 'master',
  'DIR': 'metadata',
  'REPO': 'https://github.com/smartscenes/sstk-metadata.git',
  'DATA_DIRS': ['labels', 'matterport', 'nyuv2', 'shapenet', 'suncg']
};

var my_path = path.dirname(__filename);
shell.cd(my_path);

// pull metadata from git repo
if (shell.test('-e', METADATA.DIR)) {
  shell.rm('-rf', METADATA.DIR);
}
shell.exec(`git clone ${METADATA.REPO} --branch ${METADATA.VER} --single-branch ${METADATA.DIR}`)

// create symlinks to data dirs
METADATA.DATA_DIRS.forEach(function (l) {
  var src = `../../../${METADATA.DIR}/data/${l}`
  var tgt = `server/static/data/${l}`;
  shell.ln('-sf', src, tgt);
});

// add symlink of suncg v1 models as default "full" model set
var SUNCG_MODELS_DEFAULT = 'suncg.planner5d.models.v1.csv'
var SUNCG_MODELS_CSV = `server/static/data/suncg/suncg.planner5d.models.full.csv`
shell.ln('-sf', SUNCG_MODELS_DEFAULT, SUNCG_MODELS_CSV);
