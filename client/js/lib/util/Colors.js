var _ = require('util');

/**
 * Colors
 * @module Colors
 **/
var self = {};

/**
 * An ordered list of colors
 * @typedef {Object} Palette
 * @property name {string}
 * @property colors {Array.<string|number|THREE.Color>} List of colors in the palette
 * @static
 **/

/**
 * Predefined palettes
 * @static
 * @enum
 */
self.palettes = {
  // Colors from http://bl.ocks.org/aaizemberg/78bd3dade9593896a59d
  d3_category20: {
    name: 'd3_category_20',
    colors: [
      '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c', '#98df8a', '#d62728', '#ff9896',
      '#9467bd', '#c5b0d5', '#8c564b', '#c49c94', '#e377c2', '#f7b6d2',
      '#7f7f7f', '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5']
  },
  d3_category18: {
    // Just like d3_category20 but no grays!
    name: 'd3_category_18',
    colors: [
      '#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c', '#98df8a', '#d62728', '#ff9896',
      '#9467bd', '#c5b0d5', '#8c564b', '#c49c94', '#e377c2', '#f7b6d2',
      '#bcbd22', '#dbdb8d', '#17becf', '#9edae5']
  },
  d3_category18p: {
    // Just like d3_category18 but with the more pastel colors coming before the darker colors
    name: 'd3_category_18p',
    colors: [
      '#aec7e8', '#1f77b4', '#ffbb78', '#ff7f0e', '#98df8a', '#2ca02c', '#ff9896', '#d62728',
      '#c5b0d5', '#9467bd', '#c49c94', '#8c564b', '#f7b6d2', '#e377c2',
      '#dbdb8d', '#bcbd22', '#9edae5', '#17becf']
  },
  d3_category19p: {
    // Just like d3_category18p but with the first color a blue gray (we don't always use the first color for some reason)!
    name: 'd3_category_19p',
    colors: [
      '#708090',
      '#aec7e8', '#1f77b4', '#ffbb78', '#ff7f0e', '#98df8a', '#2ca02c', '#ff9896', '#d62728',
      '#c5b0d5', '#9467bd', '#c49c94', '#8c564b', '#f7b6d2', '#e377c2',
      '#dbdb8d', '#bcbd22', '#9edae5', '#17becf']
  },
  unknown: {
    name: 'unknown',
    colors: [ '#A9A9A9' ]
  }
};
self.palettes['d3_unknown_category19p'] = {
  name: 'd3_unknown_category19p',
  colors: self.palettes.unknown.colors.concat(self.palettes.d3_category19p.colors)
};
self.palettes['d3_unknown_category18'] = {
  name: 'd3_unknown_category18',
  colors: self.palettes.unknown.colors.concat(self.palettes.d3_category18.colors)
};

function toColor(value) {
  if (value instanceof THREE.Color) {
      return value;
  } else {
    var color = new THREE.Color();
    if (typeof value === 'string') {
      var style = value;
      if (/^\#([0-9a-fA-F]{6})$/i.test(style)) {
        color.setHex(parseInt(style.substr(1, 6), 16));
      } else if (/^\#([0-9a-fA-F]{8})$/i.test(style)) {
        color.setHex(parseInt(style.substr(1, 6), 16));
      } else {
        color.setStyle(style);
      }
    } else if (value && (value.count || value.length)) {
      color.setRGB(value[0], value[1], value[2]);
    } else {
      color.set(value);
    }
    return color;
  }
}
self.toColor = toColor;

function createColor(id, palette, addToPalette) {
  var colorIdx = id;
  if (palette) {
    if (colorIdx < palette.colors.length && palette.colors[colorIdx] != undefined) {
      return toColor(palette.colors[colorIdx]);
    } else {
      palette.extra_colors_start = palette.extra_colors_start || palette.colors.length;
      colorIdx = id - palette.extra_colors_start;
    }
  }
  var c = generateColor(colorIdx);
  if (addToPalette && palette) {
    palette.colors[colorIdx] = c;
  }
  return c;
}

self.createColor = createColor;

//self.ColorSpaces = { RGB: 0, HSL: 1 };

function createPalette(name, colors, n, interpolateSpace) {
    if (n) {
      // interpolate between colors (n extra in between each pair)
      var t = n+1;
      var r = 1.0/t;
      var finalColors = [];
      if (interpolateSpace === 'hsl') {
        var hslColors = colors.map(function (x) {
          return toColor(x).getHSL();
        });
        for (var i = 0; i < colors.length - 1; i++) {
          var c1 = hslColors[i];
          var c2 = hslColors[i + 1];
          var offset = {h: (c2.h - c1.h) * r, s: (c2.s - c1.s) * r, l: (c2.l - c1.l) * r};

          for (var j = 0; j < t; j++) {
            var c = new THREE.Color();
            c.setHSL(c1.h + j * offset.h, c1.s + j * offset.s, c1.l + j * offset.l);
            finalColors.push(c);
          }
        }
      } else {
        // Assume RGB
        var rgbColors = colors.map(function (x) {
          return toColor(x);
        });
        for (var i = 0; i < colors.length - 1; i++) {
          var c1 = rgbColors[i];
          var c2 = rgbColors[i + 1];
          var offset = {r: (c2.r - c1.r) * r, g: (c2.g - c1.g) * r, b: (c2.b - c1.b) * r};

          for (var j = 0; j < t; j++) {
            var c = new THREE.Color();
            c.setRGB(c1.r + j * offset.r, c1.g + j * offset.g, c1.b + j * offset.b);
            finalColors.push(c);
          }
        }
      }
      finalColors.push(toColor(colors[colors.length - 1]));
      return {name: name, colors: finalColors};
    } else {
      return {name: name, colors: colors};
    }
}
self.createPalette = createPalette;

// Interpolate between color c1 and c2, with weight being weight in the direction of c2
function interpolateColor(color1, color2, opts) {
  if (typeof(opts) === 'number') {
    opts = { weight: opts };
  } else {
    opts = opts || {};
  }
  var c = opts.result || new THREE.Color();
  var weight = (opts.weight != undefined)? opts.weight : 0.5;
  if (opts.space === 'hsl') {
    var c1 = color1.getHSL();
    var c2 = color2.getHSL();
    var offset = {h: c2.h - c1.h, s: c2.s - c1.s, l: c2.l - c1.l};
    c.setHSL(c1.h + weight * offset.h, c1.s + weight * offset.s, c1.l + weight * offset.l);
  } else {
    var c1 = color1;
    var c2 = color2;
    var offset = {r: c2.r - c1.r, g: c2.g - c1.g, b: c2.b - c1.b};
    c.setRGB(c1.r + weight * offset.r, c1.g + weight * offset.g, c1.b + weight * offset.b);
  }
  //console.log('get color for ' + opts.weight, c);
  return c;
}

self.interpolateColor = interpolateColor;

function getColorFunction(opts) {
  if (opts.type === 'interpolate') {
    //console.log('getColorFunction', opts);
    var colors = _.map(opts.colors, toColor);
    var maxWeight = opts.maxWeight || (colors.length-1);
    var minWeight = opts.minWeight || 0;
    var range = (maxWeight - minWeight) || 1; // Make sure we don't divide by 0
    var nsteps = colors.length-1;
    return function(w) {
      if (!_.isFinite(w)) {
        return opts.infinity || 'gray';
      }
      var weight = (w - minWeight) / range;
      var i = Math.min(Math.floor(weight*nsteps), nsteps);
      var j = Math.min(i+1, nsteps);
      var color1 = colors[i];
      var color2 = colors[j];
      var cw = weight - i*1.0/nsteps;
      if (opts.debug) {
        console.log('get color for w=' + w + ', weight= ' + weight + ', cw=' + cw, i, j, color1, color2);
      }
      return interpolateColor(color1, color2, { weight: cw, space: opts.space, result: opts.result });
    };
  } else if (opts.type === 'map') {
    return function(w) {
      return opts.mapping[w];
    };
  } else {
    throw 'Unsupported color function type: ' + opts.type;
  }
}

self.getColorFunction = getColorFunction;

function concatPalettes(name, palettes) {
  var colors = [];
  for (var i = 0; i < palettes.length; i++) {
    //console.log('push', palettes.length);
    Array.prototype.push.apply(colors,palettes[i].colors);
  }
  return { name: name, colors: colors };
}
self.concatPalettes = concatPalettes;

function generateColor(colorIdx) {
  var c = new THREE.Color();
  var h = (-3.88 * colorIdx) % (2 * Math.PI);
  if (h < 0) h += 2 * Math.PI;
  h /= 2 * Math.PI;
  var ls = [0.5, 0.6, 0.45, 0.55, 0.35, 0.4];
  var lvalue = ls[Math.floor(colorIdx / 13) % ls.length];
  //console.log(lvalue);
  //c.setHSV(h, 0.6 + 0.2 * Math.sin(0.42 * colorIdx), 1);
  c.setHSL(h, 0.4 + 0.2 * Math.sin(0.42 * colorIdx), lvalue);
  return c;
}
self.generateColor = generateColor;

var phi = (1 + Math.sqrt(5))/2;
var invPhi = 1.0/phi;
function generatePhiColor(colorIdx) {
  var startColor = new THREE.Color(0x4FD067);
  var hsb = startColor.getHSL();
  var hue = hsb.h + colorIdx*invPhi;
  hue = hue - Math.floor(hue);
  var c = new THREE.Color();
  c.setHSL(hue, 0.5, 0.95);
  // Switch blue and green for nice pretty colors
  return new THREE.Color(c.r, c.b, c.g);
}
self.generatePhiColor = generatePhiColor;

function isValidColor(color) {
  return isFinite(color.r) && isFinite(color.g) && isFinite(color.b);
}
self.isValidColor = isValidColor;

function lighten(color) {
  var c = toColor(color).clone();
  var hsl = c.getHSL();
  c.offsetHSL(0, 0, (1.0 - hsl.l)/2);
  return c;
}
self.lighten = lighten;

function darken(color) {
  var c = toColor(color).clone();
  var hsl = c.getHSL();
  c.offsetHSL(0, 0, -hsl.l/2);
  return c;
}
self.darken = darken;

_.each(self.palettes, function(x) {
  x.colors = _.map(x.colors, function(c) { return toColor(c); });
});

module.exports = self;
