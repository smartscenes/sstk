function Audio(params) {
  this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  this.channels = 1; // Mono

  // Get an AudioBufferSourceNode.
  // This is the AudioNode to use when we want to play an AudioBuffer
  this.source = this.audioCtx.createBufferSource();

  // connect the AudioBufferSourceNode to the
  // destination so we can hear the sound
  this.source.connect(this.audioCtx.destination);
}

Audio.prototype.createBuffer = function(opts) {
  var audioBuffer = this.audioCtx.createBuffer(opts.channels, opts.frameCount, opts.sampleRate);
  if (opts.data) {
    for (var i = 0; i < opts.channels.length; i++) {
      var b = audioBuffer.getChannelData(i);
      var base = i*opts.frameCount;
      for (var j = 0; j < opts.frameCount; j++) {
        b[j] = opts.data[base + j];
      }
    }
  }
  return audioBuffer;
};

Audio.prototype.play = function(buffer) {
  if (buffer) {
    // set the buffer in the AudioBufferSourceNode
    this.source.buffer = buffer;
  }
  // start the source playing
  this.source.start();
};

module.exports = Audio;