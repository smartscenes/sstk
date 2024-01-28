/**
 * Basic disjoint-set forest data structure using union-by-rank and path compression
 * @constructor
 * @memberOf ds
 */
class DisjointSet {
  constructor(numElements) {
    this.numSets = numElements;
    this.elts = new Array(numElements);
    for (let i = 0; i < numElements; i++) {
      this.elts[i] = { rank: 0, size: 1, p: i };
    }
  }

  size(x) {
    return this.elts[x].size;
  }

  find(x) {
    let y = x;
    while (y != this.elts[y].p) {
      y = this.elts[y].p;
    }
    this.elts[x].p = y;
    return y;
  }

  join(x, y) {
    if (this.elts[x].rank > this.elts[y].rank) {
      this.elts[y].p = x;
      this.elts[x].size += this.elts[y].size;
    } else {
      this.elts[x].p = y;
      this.elts[y].size += this.elts[x].size;
      if (this.elts[x].rank == this.elts[y].rank)
        this.elts[y].rank++;
    }
    this.numSets--;
  }

  getSets() {
    const sets = {};
    for (let i = 0; i < this.elts.length; i++) {
      const setIndex = this.find(i);
      if (sets[setIndex]) {
        sets[setIndex].push(i);
      } else {
        sets[setIndex] = [i];
      }
    }
    return sets;
  }

  static joinSmallSets(u, edges, minSize) {
    for (let j = 0; j < edges.length; j++) {
      const a = u.find(edges[j].a);
      const b = u.find(edges[j].b);
      if ((a != b) && ((u.size(a) < minSize) || (u.size(b) < minSize))) {
        u.join(a, b);
      }
    }
  }

  static segmentGraph(numVertices, edges, c) {
    edges.sort((a, b) => a.w - b.w);
    const u = new DisjointSet(numVertices);
    const threshold = new Array(numVertices).fill(c);
    for (let i = 0; i < edges.length; i++) {
      let pedge = edges[i];
      let a = u.find(pedge.a);
      let b = u.find(pedge.b);
      if (a != b) {
        if ((pedge.w <= threshold[a]) && (pedge.w <= threshold[b])) {
          u.join(a, b);
          a = u.find(a);
          threshold[a] = pedge.w + (c / u.size(a));
        }
      }
    }
    return u;
  }
}

module.exports = DisjointSet;
