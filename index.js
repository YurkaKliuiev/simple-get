'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

module.exports = simpleGet;

var concat = require('simple-concat');
var decompressResponse = require('decompress-response'); // excluded from browser build
var http = require('http');
var https = require('https');
var once = require('once');
var querystring = require('querystring');
var url = require('url');

var isStream = function isStream(o) {
  return o !== null && (typeof o === 'undefined' ? 'undefined' : _typeof(o)) === 'object' && typeof o.pipe === 'function';
};

function simpleGet(opts, cb) {
  opts = Object.assign({ maxRedirects: 10 }, typeof opts === 'string' ? { url: opts } : opts);
  cb = once(cb);

  if (opts.url) {
    var _url$parse = url.parse(opts.url),
        hostname = _url$parse.hostname,
        port = _url$parse.port,
        _protocol = _url$parse.protocol,
        auth = _url$parse.auth,
        path = _url$parse.path;

    delete opts.url;
    if (!hostname && !port && !_protocol && !auth) opts.path = path; // Relative redirect
    else Object.assign(opts, { hostname: hostname, port: port, protocol: _protocol, auth: auth, path: path }); // Absolute redirect
  }

  var headers = { 'accept-encoding': 'gzip, deflate' };
  if (opts.headers) Object.keys(opts.headers).forEach(function (k) {
    return headers[k.toLowerCase()] = opts.headers[k];
  });
  opts.headers = headers;

  var body = void 0;
  if (opts.body) {
    body = opts.json && !isStream(opts.body) ? JSON.stringify(opts.body) : opts.body;
  } else if (opts.form) {
    body = typeof opts.form === 'string' ? opts.form : querystring.stringify(opts.form);
    opts.headers['content-type'] = 'application/x-www-form-urlencoded';
  }
  delete opts.body;delete opts.form;

  if (body) {
    if (!opts.method) opts.method = 'POST';
    if (!isStream(body)) opts.headers['content-length'] = Buffer.byteLength(body);
    if (opts.json) opts.headers['content-type'] = 'application/json';
  }
  if (opts.json) opts.headers.accept = 'application/json';
  if (opts.method) opts.method = opts.method.toUpperCase();

  var protocol = opts.protocol === 'https:' ? https : http; // Support http/https urls
  var req = protocol.request(opts, function (res) {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      opts.url = res.headers.location; // Follow 3xx redirects
      delete opts.headers.host; // Discard `host` header on redirect (see #32)
      res.resume(); // Discard response

      if (opts.method === 'POST' && [301, 302].includes(res.statusCode)) {
        opts.method = 'GET'; // On 301/302 redirect, change POST to GET (see #35)
        delete opts.headers['content-length'];delete opts.headers['content-type'];
      }

      if (opts.maxRedirects-- === 0) return cb(new Error('too many redirects'));else return simpleGet(opts, cb);
    }

    var tryUnzip = typeof decompressResponse === 'function' && opts.method !== 'HEAD';
    cb(null, tryUnzip ? decompressResponse(res) : res);
  });
  req.on('timeout', function () {
    req.abort();
    cb(new Error('Request timed out'));
  });
  req.on('error', cb);

  if (isStream(body)) body.on('error', cb).pipe(req);else req.end(body);

  return req;
}

simpleGet.concat = function (opts, cb) {
  return simpleGet(opts, function (err, res) {
    if (err) return cb(err);
    concat(res, function (err, data) {
      if (err) return cb(err);
      if (opts.json) {
        try {
          data = JSON.parse(data.toString());
        } catch (err) {
          return cb(err, res, data);
        }
      }
      cb(null, res, data);
    });
  });
};['get', 'post', 'put', 'patch', 'head', 'delete'].forEach(function (method) {
  simpleGet[method] = function (opts, cb) {
    if (typeof opts === 'string') opts = { url: opts };
    return simpleGet(Object.assign({ method: method.toUpperCase() }, opts), cb);
  };
});