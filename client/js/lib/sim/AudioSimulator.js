// AudioSimulator
var Constants = require('Constants');
var PubSub = require('PubSub');
var _ = require('util');
var async = require('async');

var __optsToIgnore = ['net', 'wav', 'fs', 'bufferType'];

/**
 * Audio simulator
 * @param opts Configuration for audio simulator
 * @param [opts.host='localhost'] {string} Hostname or IP of audio simulator to connect to
 * @param [opts.port=1112] {int} Port number
 * @param [opts.samplingRate=8000] {number} Sampling rate
 * @constructor
 * @memberOf sim
 */
function AudioSimulator (opts) {
  PubSub.call(this);
  opts = _.defaultsDeep(Object.create(null), opts,
    { host: 'localhost', port: 1112, samplingRate: 8000 });
  this.opts = opts;
  console.log('Creating AudioSimulator with options', _.omit(opts, __optsToIgnore));
  this.__init(opts);
}

AudioSimulator.prototype = Object.create(PubSub.prototype);
AudioSimulator.prototype.constructor = AudioSimulator;

AudioSimulator.prototype.reset = function () {
  this.__messageListeners = {};
};

AudioSimulator.prototype.close = function (callback) {
  console.log('Closing connection to AudioSimulator');
  var scope = this;
  this.__sendClose(function (err, msg) {
    scope.client.end();
    console.log('Closed connection to AudioSimulator');
    if (callback) { callback(); }
  }, 200); // Closing (waiting up to 200ms)
};


AudioSimulator.prototype.update = function (opts, callback) {
  // Update configuration of audio simulator without updating our opts
  //console.log(JSON.stringify(opts, null, 2));
  var scope = this;
  this.__sendConfigure(opts, function (err, msg) {
    if (scope.debug) {
      console.log('Got configure response ' + JSON.stringify(msg));
    }
    callback(err, msg);
  });
};

/**
 * Configuration for an audio endpoint
 * @typedef AudioSimulator.AudioEndpointConfig
 * @property op {string} Operation to perform on the audio endpoint (`create`, `update`, or `remove`)
 * @property id {int} Id of audio endpoint
 * @property type {string} Type of audio endpoint ('S'=source, 'R'=receiver)
 * @property position {{x: number, z: number}} Position of audio endpoint (in scene coordinates)
 * @property [direction] {{x: number, z: number}} Direction of audio endpoints (in scene coordinates)
 * @property [audioFile] {string} Path to audio file associated with audio endpoint
 * @memberOf sim
 */

/**
 * Configures the audio simulator
 * @async
 * @param opts Audio simulator configuration parameters
 * @param [endpoints] {sim.AudioSimulator.AudioEndpointConfig[]} Audio endpoints to configure
 * @param callback
 * @returns {*}
 */
AudioSimulator.prototype.configure = function (opts, callback) {
  // Reconfigure audio simulator
  this.opts = _.defaultsDeep(Object.create(null), opts || {}, this.opts);
  //console.log(JSON.stringify(this.opts, null, 2));
  var scope = this;
  if (callback) {
    this.__sendConfigure(this.opts, function (err, msg) {
      if (scope.debug) {
        console.log('Got configure response ' + JSON.stringify(msg));
      }
      callback(err, msg);
    });
  }
  return this.opts;
};

/**
 * Starts the audio simulator
 * @async
 * @param callback
 */
AudioSimulator.prototype.start = function (callback) {
  console.log('Starting AudioSim');
  var scope = this;
  async.series([
    function (cb) {
      if (scope.opts) {
        scope.__sendConfigure(scope.opts, function (err, msg) {
          if (scope.debug) {
            console.log('Got configure response ' + JSON.stringify(msg));
          }
          cb(err, msg);
        });
      } else {
        setTimeout(function() { cb(); }, 0);
      }
    },
    function (cb) {
      scope.__sendStart(function (err, msg) {
        console.log('Got start response ' + JSON.stringify(msg));
        cb(err, msg);
      });
    }
  ], function(err, results) {
    if (callback) { callback(err, null); }
  });
};

/**
 * Fetches the audio buffer
 * @async
 * @param opts
 * @param callback
 */
AudioSimulator.prototype.getAudioBuffer = function(opts, callback) {
  this.__getAudio(opts, function (err, msg) {
    if (callback) { callback(err, msg); }
  });
};

AudioSimulator.prototype.__init = function(opts) {
  this.debug = opts.debug;
  this.__fs = opts.fs;
  this.__wallPath = opts.wallpath;
  this.__outputDir = opts.outputDir;
  this.__bufferType = opts.bufferType;
  var bufferType = this.__bufferType;
  var client = new opts.net.Socket();

  // Message processing variables
  var header = null;
  var headerLength = 16;
  var buffer = new bufferType(8192);
  var receivedLength = 0;
  var remainingLength = headerLength;

  // Total statistics
  this.__stats = {
    totalReceivedBytes: 0,
    totalReceivedMessages: 0
  };
  this.__msgRequestId = 0;
  this.__messageListeners = {};

  var scope = this;
  client.connect(opts.port, opts.host, function() {
    console.log('AudioSim connected ');
    scope.Publish('connected');
  });

  client.on('data', function(data) {
    //console.log('Received: ', data);
    // Accumulate until we get a message
    var offset = 0;
    while (offset < data.length) {
      if (remainingLength > 0) {
        // Accumulate into our buffer
        var unprocessed = data.length - offset;
        var nbytes = Math.min(unprocessed, remainingLength);
        data.copy(buffer, receivedLength, offset, offset+nbytes);
        receivedLength += nbytes;
        remainingLength -= nbytes;
        offset += nbytes;
      }
      if (remainingLength === 0) {
        // Finished receiving either header or body
        if (header == null) {
          // Was header - get message type and message length from it
          // TODO: process first 4 bytes
          header = {};
          header.format = buffer.readUInt8(0);
          header.flags = buffer.readUInt8(1);
          header.version = buffer.readUInt16LE(2);
          header.msgType = buffer.readUInt32LE(4);
          header.msgId = buffer.readUInt32LE(8);
          header.msgLength = buffer.readUInt32LE(12);
          // console.log('header', header);
          if (header.msgLength > buffer.length) {
            buffer = new bufferType(header.msgLength); // Make sure we allocate enough
          }
          receivedLength = 0;
          remainingLength = header.msgLength;
        } else {
          // Was message
          scope.__stats.totalReceivedMessages++;
          scope.__processMessage({type: header.msgType, msgId: header.msgId, length: header.msgLength, data: buffer.slice(0, header.msgLength)});
          // Prepare for a new header
          receivedLength = 0;
          remainingLength = headerLength;
          header = null;
        }
        buffer.fill(0);  // Empty our buffer (not really needed)
      }
    }
    scope.__stats.totalReceivedBytes += data.length;
  });

  client.on('close', function() {
    console.log('AudioSim connection closed');
    // Cleanup all message listeners
    scope.__notifyAllListeners('AudioSim disconnected', null, true);
    scope.Publish('close');
  });

  this.client = client;
};

// Send audio simulator requests

AudioSimulator.prototype.__sendStart = function(callback) {
  this.__sendMessage({ name: 'start_req' }, callback);
};

AudioSimulator.prototype.__sendClose = function(callback, timeout) {
  this.__sendMessage({ name: 'close_req' }, callback, timeout);
};

AudioSimulator.prototype.__sendConfigure= function(opts, callback) {
  this.__sendMessage(_.merge({ name: 'configure_req' }, _.omit(opts, __optsToIgnore)), callback);
};

AudioSimulator.prototype.__getAudio = function(opts, callback) {
  this.__sendMessage(_.merge({ name: 'get_audio_req' }, opts), callback);
};

// Prepare messages for sending

var MSG_VERSION = 0;
var MSG_FORMAT_BINARY = 0;
var MSG_FORMAT_BINARY_HEADER_ASCII_BODY = 1;

function __prepareBasicRequest(audioSim, m, msg, size) {
  size = size || 0;
  var buffer = new audioSim.__bufferType(16 + size);
  buffer.writeUInt8((m.format != undefined)? m.format : MSG_FORMAT_BINARY);     // format
  buffer.writeUInt8(0, 1);     // flags
  buffer.writeUInt16LE(MSG_VERSION, 2);  // version
  buffer.writeUInt32LE(m.type, 4);
  buffer.writeUInt32LE(msg.msgId, 8);
  buffer.writeUInt32LE(size, 12);
  return { buffer: buffer, offset: 16 };
}

function __prepareConfigureRequest(audioSim, m, msg) {
  // Convert configuration
  if (m.format === MSG_FORMAT_BINARY) {
    // TODO: stuff configure message into binary format
    var res = __prepareBasicRequest(audioSim, m, msg, 0);
    return res;
  } else if (m.format === MSG_FORMAT_BINARY_HEADER_ASCII_BODY) {
    var configData = [];
    if (msg.scene) {
      var sceneId = msg.scene.fullId.split('.')[1];
      if (audioSim.__wallPath) {
        configData.push(['W', audioSim.__wallPath].join(' '));
      }
      configData.push(['S', sceneId, msg.samplingRate].join(' '));
    }
    for (var i = 0; i < msg.endpoints.length; i++) {
      var e = msg.endpoints[i];
      var dir = e.direction || { x: 0, z: 0 };
      // NOTE: Audio simulator expects z, then x!
      switch (e.op.toLowerCase()) {
        case 'c':
        case 'create':
          configData.push(['C', e.id, e.type, e.position.z, e.position.x, dir.z, dir.x, e.audioFile || "none"].join(' '));
          break;
        case 'u':
        case 'update':
          configData.push(['U', e.id, e.position.z, e.position.x, dir.z, dir.x].join(' '));
          break;
        case 'r':
        case 'remove':
          configData.push(['R', e.id].join(' '));
          break;
      }
    }
    var configString = configData.join('\n');
    if (audioSim.debug && msg.scene) {
      var outfilename = 'audio_config_' + msg.msgId + '.sas';
      if (audioSim.__output_dir) {
        outfilename = audioSim.__output_dir + '/' + outfilename;
      }
      audioSim.__fs.fsWriteToFile(outfilename, configString, function() {});
    }
    var res = __prepareBasicRequest(audioSim, m, msg, configString.length);
    res.buffer.write(configString, res.offset);
    return res;
  } else {
    throw new Error('Unsupported request format');
  }
}

function __prepareAudioRequest(audioSim, m, msg) {
  var res = __prepareBasicRequest(audioSim, m, msg, 8);
  res.buffer.writeUInt32LE(msg.startTime, res.offset); res.offset+=4;
  res.buffer.writeUInt32LE(msg.endTime, res.offset); res.offset+=4;
  //  console.log(res);
  return res;
}

// Process server responses

function __processBasicResponse(audioSim, m, rawmsg, includeOffset) {
  var buffer = rawmsg.data;
  var msg = { name: m.name, msgId: rawmsg.msgId, status: buffer.readInt32LE(0) };
  if (includeOffset) {
    msg.offset = 8;
  }
  return msg;
}

function __processAudioResponse(audioSim, m, rawmsg) {
  var res = __processBasicResponse(audioSim, m, rawmsg, true);
  var buffer = rawmsg.data;
  res.numReceivers = buffer.readUInt32LE(res.offset); res.offset+=4;
  res.startTime = buffer.readUInt32LE(res.offset); res.offset+=4;
  res.endTime = buffer.readUInt32LE(res.offset); res.offset+=4;
  res.numSamples = buffer.readUInt32LE(res.offset); res.offset+=4;
  res.endpoints = [];
  res.endpointShortestPaths = new Float32Array(4 * res.numReceivers);  // [dist, dir_x, dir_y, amp] for each receiver
  for (var i = 0; i < res.numReceivers; i++) {
    var id = buffer.readInt32LE(res.offset); res.offset+=4;
    res.endpoints.push(id);
  }
  for (var k = 0; k < res.numReceivers; k++) {
    var dist = buffer.readFloatLE(res.offset); res.offset+=4;
    var dir_x = buffer.readFloatLE(res.offset); res.offset+=4;
    var dir_y = buffer.readFloatLE(res.offset); res.offset+=4;
    var amp = buffer.readFloatLE(res.offset); res.offset+=4;
    var base = 4 * k;
    res.endpointShortestPaths[base] = dist;
    res.endpointShortestPaths[base+1] = dir_x;
    res.endpointShortestPaths[base+2] = dir_y;
    res.endpointShortestPaths[base+3] = amp;
  }

  var totalSamples = res.numReceivers * res.numSamples;
  var b = buffer.slice(res.offset, res.offset + totalSamples);
  // var b = buffer.slice(res.offset, res.offset + (res.numReceivers * res.numSamples * 4));
  // NOTE: assumes samples are in same endianness as source of data
  //var arrayBuf = audioSim.fs.toArrayBuffer(b);
  if (totalSamples > 0) {
    if (audioSim.opts.datatype === 'float32') {
      res.samples = new Float32Array(totalSamples); //new Float32Array(arrayBuf);
      for (var j = 0; j < b.length; j++) {
        var v = b[j] - 128;
        res.samples[j] = v < 0 ? v / 128 : v / 127;
        //console.log(b[j] + ' -> ' + res.samples[j]);
      }
    } else {
      res.samples = new Uint8Array(totalSamples);
      for (var j = 0; j < b.length; j++) {
        res.samples[j] = b[j];
      }
    }
    //console.log(res.samples);
    //console.log('samples float32 length:', res.samples.length);
  } else {
    console.warn('No audio samples received!');
  }

  res.encoding = 'pcm';
  res.sampleRate = audioSim.opts.samplingRate;
  res.shape = [res.numReceivers, res.numSamples, 1];

  return _.omit(res, ['offset']);
}

// Process messages

var __messages = [
  { type: 0, name: 'start_req',         prepare: __prepareBasicRequest },
  { type: 1, name: 'start_resp',        process: __processBasicResponse },
  { type: 2, name: 'close_req',         prepare: __prepareBasicRequest },
  { type: 3, name: 'close_resp',        process: __processBasicResponse },
  { type: 4, name: 'configure_req',     prepare: __prepareConfigureRequest, format: MSG_FORMAT_BINARY_HEADER_ASCII_BODY },
  { type: 5, name: 'configure_resp',    process: __processBasicResponse },
  { type: 6, name: 'get_audio_req',     prepare: __prepareAudioRequest },
  { type: 7, name: 'get_audio_resp',    process: __processAudioResponse }
];

var __messagesByType = _.keyBy(__messages, 'type');
var __messagesByName = _.keyBy(__messages, 'name');

AudioSimulator.prototype.__addListener = function(msg, callback) {
  if (this.__messageListeners[msg.msgId]) {
    this.__messageListeners[msg.msgId].push(callback);
  } else {
    this.__messageListeners[msg.msgId] = [callback];
  }
};

AudioSimulator.prototype.__clearListeners = function(msg) {
  delete this.__messageListeners[msg.msgId];
};

AudioSimulator.prototype.__notifyListeners = function(msgId, err, response, clear) {
  if (this.__messageListeners[msgId]) {
    this.__messageListeners[msgId].forEach(function(listener) {
      listener(err, response);
    });
    if (clear) {
      delete this.__messageListeners[msgId];
    }
  }
};

AudioSimulator.prototype.__notifyAllListeners = function(err, response, clear) {
  _.each(this.__messageListeners, function(listeners, msgId) {
    listeners.forEach(function (listener) {
      listener(err, response);
    });
  });
  if (clear) {
    this.__messageListeners = {};
  }
};

AudioSimulator.prototype.__sendMessage = function(msg, callback, timeout) {
  this.__msgRequestId++;
  msg.msgId = this.__msgRequestId;
  var m = __messagesByName[msg.name];
  if (m && m.prepare) {
    if (this.debug) {
      console.log('send message', JSON.stringify(msg, null, 2));
    }
    var rawmsg = m.prepare(this, m, msg);
    if (callback) {
      // Setup callback for when the response for this message comes
      this.__addListener(msg, callback);
    }
    try {
      this.client.write(rawmsg.buffer);
      if (timeout != undefined) {
        var scope = this;
        setTimeout( function() {
          var errmsg = 'Request ' + msg.name + ' ' + msg.msgId + ' timed out after ' + timeout + ' milliseconds';
          console.warn(errmsg);
          scope.__notifyListeners(msg.msgId, errmsg, null, true);
        }, timeout);
      }
    } catch (err) {
      if (callback) {
        console.warn('Error sending message ' + msg.name, err);
        this.__notifyListeners(msg.msgId, 'Error sending message ' + msg.name, null, true);
      }
    }
  } else {
    console.warn('Cannot send message ' + msg.name);
    if (callback) {
      callback('Cannot send message ' + msg.name, null);
    }
  }
};

AudioSimulator.prototype.__processMessage = function(rawmsg) {
  // A message was received - parse it and pass it on
  var m = __messagesByType[rawmsg.type];
  if (m && m.process) {
    var processed = m.process(this, m, rawmsg);
    if (this.debug) {
      console.log('message', JSON.stringify(_.omitBy(processed, function (x) {
          return x && x.buffer;
        }
      ), null, 2));
    }
    this.__notifyListeners(processed.msgId, null, processed, true);
    this.Publish('message', processed);
  } else {
    console.warn('Cannot process message type ' + rawmsg.type);
  }
};

module.exports = AudioSimulator;
