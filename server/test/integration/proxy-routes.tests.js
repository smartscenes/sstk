'use strict';

var runReverseProxy = require('../../lib/reverse-proxy'),
    chai = require('chai'),
    async = require('async'),
    http = require('http'),
    request = require('request'),
    expect = chai.expect;

describe('Proxy Routes', function () {
  var endPointPort = 9060;
  var proxyServerPort = 6010;
  var proxyRules = {
    '.*/test': 'http://localhost:' + endPointPort + '/cool',
    '.*/test2/': 'http://localhost:' + endPointPort + '/cool2/'
  };
  var endpointPrefix = 'http://localhost:9060';

  before(function (done) {
    // runs before all tests in this block
    http.createServer(function (req, res) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        translatedPath: req.url
      })); // response includes the url that you tried to access
    }).listen(endPointPort, function mockServerReady() {
      runReverseProxy({
        port: proxyServerPort,
        rules: proxyRules,
        default: 'http://localhost:' + endPointPort,
        log: console
      }, function proxyServerReady() {
        done(); // call done to start running test suite
      });
    });
  });

  after(function (done) {
    // runs after all tests in this block
    done();
  });

  it('should translate the url correctly', function (done) {
    // Feel free to add more cases
    var urlTranslationTests = [{
        visitedPath: '/test',
        newUrlEndpoint: endpointPrefix + '/cool'
      }, {
        visitedPath: '/test/',
        newUrlEndpoint: endpointPrefix + '/cool/'
      }, {
        visitedPath: '/test?hi=5/',
        newUrlEndpoint: endpointPrefix + '/cool?hi=5/'
      }, {
        visitedPath: '/test2/yo',
        newUrlEndpoint: endpointPrefix + '/cool2/yo'
      }, {
        visitedPath: '/fuzzyshoe/test',
        newUrlEndpoint: endpointPrefix + '/cool'
      }, {
        visitedPath: '/test/seven',
        newUrlEndpoint: endpointPrefix + '/cool/seven'
      }, {
        visitedPath: '/testalmost',
        newUrlEndpoint: endpointPrefix + '/testalmost'
      }, {
        visitedPath: '/testalmost/5',
        newUrlEndpoint: endpointPrefix + '/testalmost/5'
      }
    ];

    // makes a bunch of requests in parallel, and then calls
    // `done` after we receive all responses back
    async.each(urlTranslationTests, function makeRequest(comparisonObj, cb) {
      request({
        url: 'http://localhost:' + proxyServerPort + comparisonObj.visitedPath,
        json: true
      }, function processResp(err, res, body) {
        expect(res.statusCode).to.equal(200);
        expect(body.translatedPath).to.equal(comparisonObj.newUrlEndpoint);
        cb();
      });
    }, done);

  });

});
