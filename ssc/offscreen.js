var width = 640;
var height = 480;
var fs = require('fs');
var gl = require('gl')(width, height);
var PNG = require('pngjs').PNG;
var jsdom = require('jsdom');
var canvas = { addEventListener: function (a, b, c) { return 1; } };  // dummy canvas

// setup the simplest document possible
var doc = jsdom.jsdom('<!doctype html><html><head></head><body><div id="canvas"></div></body></html>');
var win = doc.defaultView;
global.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
global.window = win;
global.document = doc;
// take all properties of the window object and also attach it to the node global object
function propagateToGlobal (w) {
  for (var key in w) {
    if (!w.hasOwnProperty(key)) { continue; }
    if (key in global) { continue; }
    global[key] = w[key];
  }
}
propagateToGlobal(win);
// need to load THREE after patching globals
var THREE = require('../client/js/vendor/three/three.min');

var writePNG = function (path, width, height, pixels) {
  var png = new PNG({width: width, height: height});
  for (var i = 0; i < pixels.length; i++) {
    png.data[i] = pixels[i];
  }
  buff = PNG.sync.write(png);
  fs.writeFileSync(path, buff);
};

var render = function (scene, camera, pngFile) {
  var renderer = new THREE.WebGLRenderer({
    antialias: true,
    width: width,
    height: height,
    canvas: canvas,
    context: gl
  });

  var rtTexture = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat
  });

  renderer.setRenderTarget(rtTexture);
  renderer.clear();
  renderer.render(scene, camera);

  // read back in the pixel buffer
  var pixels = new Uint8Array(4 * width * height);
  renderer.readRenderTargetPixels(rtTexture, 0, 0,
                                  width, height, pixels)
  writePNG(pngFile, width, height, pixels);
};

var getPlane = function() {
  //var texture = THREE.ImageUtils.loadTexture("./turtle.png");
  var geometry = new THREE.PlaneGeometry(200, 200);
  var material = new THREE.MeshBasicMaterial({
    color: 0x998144,
    //map: texture,
    overdraw: true
  });
  var plane = new THREE.Mesh(geometry, material);
  plane.position.z = -50;
  plane.position.y = -4;
  plane.position.x = 4.5;
  return plane;
};

var getTeapot = function(callback) {
  var objectLoader = new THREE.ObjectLoader();
  // objectLoader.load('teapot.json', function(obj) {
  //   // var mat = new THREE.MultiMaterial(mats);
  //   // var mesh = new THREE.Mesh(geo, mat);
  //   // console.log(mesh);
  //   callback(obj);
  // });
  var json = JSON.parse(fs.readFileSync('../resources/models/teapot-claraio.json'));
  var obj = objectLoader.parse(json);
  callback(obj);
}

var plane = getPlane();
//console.log(plane);

getTeapot(function(teapot) {
  // console.log(teapot);

  // setup camera
  var camera = new THREE.PerspectiveCamera(50, width / height, 1, 1000);
  camera.position.z = 5;

  // make scene
  var scene = new THREE.Scene();
  scene.add(plane);
  scene.add(teapot);
  scene.add(camera);

  render(scene, camera, 'out.png');
});

console.log('DONE');