class DistancesMatrix {
  /**
   * Matrix is an array where element i,j contains distance from part i to part j
   * @param matrix {Array<Array<number>>} Return array where element i,j contains distance from component i to component j
   */
  constructor(matrix, isSymmetric) {
    this.matrix = matrix || [];
    this.isSymmetric = isSymmetric;
  }

  get(i,j) {
    if (this.isSymmetric) {
      return (i < j) ? (this.matrix[j]? this.matrix[j][i] : undefined) :
        (this.matrix[i]? this.matrix[i][j] : undefined);
    } else {
      return this.matrix[i]? this.matrix[i][j] : undefined;
    }
  }

  put(i,j, v) {
    if (this.isSymmetric && i < j) {
      const t = i;
      i = j;
      j = t;
    }
    this.matrix[i] = this.matrix[i] || [];
    this.matrix[i][j] = v;
  }

  /**
   * Compute distance matrix between list of components
   * @param components {Array} Components for which to compute the distance matrix
   * @param distanceFn {function(*,*): number} Returns distance between two components
   * @param getNameFn {function(*): string} Returns name for component
   * @param verbose {boolean} If verbose, time and log distance for every pair
   * @returns {DistancesMatri}x
   */
  static computeDistancesMatrix(components, distanceFn, getNameFn, verbose) {
    console.time('computeDistancesMatrix');
    // For every pair of components, compute the distance between the two components
    let distances = [];
    for (let i = 0; i < components.length; i++) {
      distances[i] = [];
      for (let j = 0; j < i; j++) {
        if (components[i] != null && components[j] != null) {
          if (verbose) {
            let name = 'distance-' + (getNameFn? (getNameFn(components[i]) + '-' + getNameFn(components[j])) :
              (i + '-' + j));
            console.time(name);
            distances[i][j] = distanceFn(components[i], components[j]);
            console.log(name, distances[i][j]);
            console.timeEnd(name);
          } else {
            distances[i][j] = distanceFn(components[i], components[j]);
          }
        }
      }
    }
    console.timeEnd('computeDistancesMatrix');
    return new DistancesMatrix(distances, true);
  }

}

module.exports = DistancesMatrix;