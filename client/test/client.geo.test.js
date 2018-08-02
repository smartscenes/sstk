'use strict';
/* jshint esversion: 6 */

var expect = require('chai').expect;
var STK = require('../../ssc/stk-ssc');  // TODO: replace with client STK bundle, and handle external dependencies
var THREE = global.THREE;
var BBox = STK.geo.BBox;
var Vector3 = THREE.Vector3;

var EPS = 0.001;

var bbox = new BBox(new Vector3(-1,-1,-1), new Vector3(1,1,1));

describe('BBox', function () {
  it('contains', function (done) {
    expect(bbox.contains(new Vector3(0,0.5,0)));
    expect(!bbox.contains(new Vector3(0,1.5,0)));
    expect(!bbox.contains(new Vector3(1,-1.01,1)));
    expect(bbox.contains(new Vector3(1,1,1)));
    expect(bbox.contains(new Vector3(-1,-1,1)));
    done();
  });
  it('closestPoint', function (done) {
    var p = new Vector3(0,0.5,0);
    expect(bbox.closestPoint(p)).to.eql(p);
    var p2 = new Vector3(1,-1,1);
    expect(bbox.closestPoint(p2)).to.eql(p2);
    var p3 = new Vector3(1,-1.01,1);
    expect(bbox.closestPoint(p3)).to.eql(p2);
    var p4 = new Vector3(1,1.5,2.5);
    expect(bbox.closestPoint(p4)).to.eql(new Vector3(1,1,1));
    done();
  });
  it('closestBoundaryPoint', function (done) {
    expect(bbox.closestBoundaryPoint(new Vector3(0,0.5,0))).to.eql(new Vector3(0,1,0));
    expect(bbox.closestBoundaryPoint(new Vector3(0,0,-0.1))).to.eql(new Vector3(0,0,-1));
    expect(bbox.closestBoundaryPoint(new Vector3(1,-1.5,0))).to.eql(new Vector3(1,-1,0));
    expect(bbox.closestBoundaryPoint(new Vector3(1,1.5,2.5))).to.eql(new Vector3(1,1,1));
    done();
  });
  it('distanceToPoint', function (done) {
    var p = new Vector3(0,0.5,0);
    expect(bbox.distanceToPoint(p)).to.be.closeTo(0.5, EPS);
    expect(bbox.distanceToPoint(p, 'clamped')).to.be.closeTo(0, EPS);
    expect(bbox.distanceToPoint(p, 'signed')).to.be.closeTo(-0.5, EPS);
    var p2 = new Vector3(1,1.5,1);
    expect(bbox.distanceToPoint(p2)).to.be.closeTo(0.5, EPS);
    expect(bbox.distanceToPoint(p2, 'clamped')).to.be.closeTo(0.5, EPS);
    expect(bbox.distanceToPoint(p2, 'signed')).to.be.closeTo(0.5, EPS);
    var p3 = new Vector3(-1,-1,-1);
    expect(bbox.distanceToPoint(p3)).to.be.closeTo(0, EPS);
    expect(bbox.distanceToPoint(p3, 'clamped')).to.be.closeTo(0, EPS);
    expect(bbox.distanceToPoint(p3, 'signed')).to.be.closeTo(0, EPS);
    done();
  });
  it('distanceTo', function (done) {
    var o = new BBox(new Vector3(1,1,1), new Vector3(2,2,2));
    expect(bbox.distanceTo(o)).to.be.closeTo(0, EPS);
    var o2 = new BBox(new Vector3(2,1,1), new Vector3(2,2,2));
    expect(bbox.distanceTo(o2)).to.be.closeTo(1, EPS);
    var o3 = new BBox(new Vector3(0,-1,-1), new Vector3(1,1,1));
    expect(bbox.distanceTo(o3)).to.be.closeTo(0, EPS);
    done();
  });
  it('hausdorffDistanceDirected', function (done) {
    expect(bbox.hausdorffDistanceDirected(bbox)).to.be.closeTo(0, EPS);
    expect(bbox.hausdorffDistanceDirected(bbox, 'clamped')).to.be.closeTo(0, EPS);
    expect(bbox.hausdorffDistanceDirected(bbox, 'signed')).to.be.closeTo(0, EPS);
    var o = new BBox(new Vector3(-2,-2,-2), new Vector3(2,2,2));
    expect(bbox.hausdorffDistanceDirected(o)).to.be.closeTo(1, EPS);
    expect(bbox.hausdorffDistanceDirected(o, 'clamped')).to.be.closeTo(0, EPS);
    expect(bbox.hausdorffDistanceDirected(o, 'signed')).to.be.closeTo(-1, EPS);
    expect(o.hausdorffDistanceDirected(bbox)).to.be.closeTo(Math.sqrt(3), EPS);
    expect(o.hausdorffDistanceDirected(bbox, 'clamped')).to.be.closeTo(Math.sqrt(3), EPS);
    expect(o.hausdorffDistanceDirected(bbox, 'signed')).to.be.closeTo(Math.sqrt(3), EPS);
    done();
  });
  it('hausdorffDistance', function (done) {
    expect(bbox.hausdorffDistance(bbox)).to.be.closeTo(0, EPS);
    expect(bbox.hausdorffDistance(bbox, 'clamped')).to.be.closeTo(0, EPS);
    expect(bbox.hausdorffDistance(bbox, 'signed')).to.be.closeTo(0, EPS);
    var o = new BBox(new Vector3(-2,-2,-2), new Vector3(2,2,2));
    expect(bbox.hausdorffDistance(o)).to.be.closeTo(Math.sqrt(3), EPS);
    expect(bbox.hausdorffDistance(o, 'clamped')).to.be.closeTo(Math.sqrt(3), EPS);
    expect(bbox.hausdorffDistance(o, 'signed')).to.be.closeTo(Math.sqrt(3), EPS);
    expect(o.hausdorffDistance(bbox)).to.be.closeTo(Math.sqrt(3), EPS);
    expect(o.hausdorffDistance(bbox, 'clamped')).to.be.closeTo(Math.sqrt(3), EPS);
    expect(o.hausdorffDistance(bbox, 'signed')).to.be.closeTo(Math.sqrt(3), EPS);
    done();
  });
});
