'use strict';

var Stats = {};

// returns a balanced latin square of n x n size for even n, or a 2n x n
// matrix pair of mirror-balanced latin squares for odd n
Stats.latinSquare = function(n) {
  // create first row
  var S = [[0]];
  var top = S[0];
  for (var i = 1; i < n; i++) {
    var d = (i % 2 === 0) ? n - i : i;
    top[i] = (top[i-1] + d) % n;
  }

  // fill in remaining rows
  for (var iR = 1; iR < n; iR++) {
    var row = [];
    var prev = S[iR-1];
    for (var iC = 0; iC < n; iC++) {
      row[iC] = (prev[iC] + 1) % n;
    }
    S[iR] = row;
  }

  // for odd n, append a mirrored copy of the square
  if (n % 2 === 1) {
    for (var j = 0; j < n; j++) {
      S.push(S[j].slice().reverse());
    }
  }

  return S;
};

module.exports = Stats;