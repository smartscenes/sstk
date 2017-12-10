/**
 * Represents a video texture
 * @param options
 * @constructor
 * @memberOf geo
 */
var VideoTexture = function(options){
  if (typeof options === 'string') {
    // Assume just url
    options = { url: options, autoplay: true, loop: true };
  }
  // From https://github.com/jeromeetienne/threex.videotexture

  // create the video element
  var video = document.createElement('video');
  // video.id = 'video';
  // video.type = ' video/ogg; codecs="theora, vorbis" ';
  video.autoplay  = options.autoplay;
  video.loop  = options.loop;
  video.src = options.url; //"videos/sintel.ogv";
  if (options.width && options.height) {
    video.width = options.width;
    video.height = options.height;
  }
  console.log('Load video from ' + video.src);
  //video.load(); // must call after setting/changing source
  //video.play();

  // alternative method --
  // create DIV in HTML:
  // <video id="myVideo" autoplay style="display:none">
  //  <source src="videos/sintel.ogv" type='video/ogg; codecs="theora, vorbis"'>
  // </video>
  // and set JS variable:
  // video = document.getElementById( 'myVideo' );

  var videoTexture = new THREE.Texture(video);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.needsUpdate = true;

  // expose video as this.video
  this.video = video;
  // expose texture as this.texture
  this.texture  = videoTexture;

  /**
   * update the object
   * @memberOf geo.VideoTexture
   * @instance
   */
  this.update = function(){
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }
    //tell texture object it needs to be updated
    videoTexture.needsUpdate = true;
  };

  /**
   * destroy the object
   * @memberOf geo.VideoTexture
   * @instance
   */
  this.destroy = function(){
    video.pause();
  };
};

module.exports = VideoTexture;