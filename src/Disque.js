'use strict';
var util = require('util');
var Events = require('events').EventEmitter;
var redis = require('redis');
var setupCommands = require('./setupCommands');
var jobCommands = require('../config/jobCommands');

var Disque = module.exports = function(config) {
  var self = this;

  Events.call(self);

  // handle just an array of clients
  if (Array.isArray(config)) {
    config = {
      servers: config
    };
  }

  self.config = config;
  self.connections = {};
  self.nodeList = [];

  for (var i = 0; i < config.servers.length; i++) {
    var c = config.servers[i];

    var name = c.host + ':' + c.port;
    self.connections[name] = self.getClient(c.port, c.host);
    self.nodeList.push(self.connections[name]);
  }

  // fetch nodes from the cluster immediately
  self.getNodes();

  // ability to update nodes on an interval
  if (config.nodeInterval) setInterval(self.getNodes.bind(self), config.nodeInterval);
};

util.inherits(Disque, Events);

setupCommands(Disque);

Disque.prototype.getClient = function(port, host) {
  var self = this;
  var name = host + ':' + port;

  // already have a connection to this client, return that
  if (self.connections[name]) return self.connections[name];

  var createClient = self.config.createClient || redis.createClient;
  var cli = createClient(port, host, self.config.redisOptions);

  cli.on('error', function(err) {
    if (/Redis connection to .* failed.*/.test(err.message)) {
      self.emit('connectionError', err, cli);
      self.getNodes();
      return;
    }

    // re-emit the error ourselves
    self.emit('error', err, cli);
  });

  return (self.connections[name] = cli);
};

Disque.prototype.getRandomConnection = function(exclude) {
  var self = this;

  var nodes = self.nodeList;
  if (exclude && exclude.length) {
    nodes = nodes.filter(function(n) {
      return exclude.indexOf(n.address) === -1;
    });
  }

  return nodes[Math.floor(Math.random() * nodes.length)];
};

Disque.prototype.getNodes = function(cb) {
  var self = this;

  var alreadyRunning = !!self._nodeQ;
  if (!alreadyRunning) self._nodeQ = [];
  if (cb) self._nodeQ.push(cb);
  if (alreadyRunning) return;

  var runCbs = function() {
    for (var i = 0; i < self._nodeQ.length; i++) {
      self._nodeQ[i].apply(self._nodeQ[i], arguments);
    }
    self._nodeQ = false;
  };

  var exclude = [];
  var tryClient = function() {
    var client = self.getRandomConnection(exclude);
    if (!client) return runCbs(new Error('couldn\'t get nodes'));

    self.client_hello(client, function(err, resp) {
      if (err) {
        // exclude this client from then next attempt
        exclude.push(client.address);
        return tryClient();
      }

      var clientList = resp.slice(2);
      var cons = {};
      self.nodes = {};
      self.nodeList = [];

      for (var i = 0; i < clientList.length; i++) {
        var n = clientList[i];
        var name = n[1] + ':' + n[2];

        var c = self.getClient(n[2], n[1]);
        c.disque = {
          id: n[0],
          id_prefix: n[0].substr(0, 8),
          priority: +n[3]
        };

        cons[name] = c;
        self.nodes[c.disque.id_prefix] = c;
        self.nodeList.push(c);
      }

      // quit now-unused clients
      for (var i in self.connections) {
        if (cons[i] || !self.connections[i]) continue;
        self.connections[i].quit();
      }

      self.connections = cons;

      runCbs(null, self.connections);
    });
  };

  tryClient();
};

Disque.prototype.selectClient = function(cmd, args) {
  var self = this;

  var cfg = jobCommands[cmd];
  if (!cfg) return self.getRandomConnection();

  var jobIDs = [];

  // all job IDs
  if (cfg[0] === 1 && !cfg[1]) {
    jobIDs = args;
  } else {
    for (var i = 0; i < args.length; i += cfg[0]) {
      jobIDs.push(args[i]);
      if (!cfg[1]) break;
    }
  }

  // just in case
  if (!jobIDs.length) return self.getRandomConnection();

  // quick code for if there's only 1 id
  if (jobIDs.length === 1) {
    var n = jobIDs[0].substr(2, 8);
    return self.nodes[n] || self.getRandomConnection();
  }

  var popular = {};
  for (var i = 0; i < jobIDs.length; i++) {
    var n = jobIDs[i].substr(2, 8);
    if (!self.nodes[n]) continue;
    if (!popular[n]) popular[n] = 0;
    popular[n]++;
  }

  var highestID;
  var highestNum = 0;

  for (var i in popular) {
    if (!highestID || popular[i] > highestNum) {
      highestID = i;
      highestNum = popular[i];
    }
  }

  if (!highestID) return self.getRandomConnection();

  return self.nodes[highestID];
};

Disque.prototype.command = function(cmd, args, cb) {
  var self = this;

  var c = self.selectClient(cmd, args);
  if (!c) return cb(new Error('couldn\'t get client'));

  self.clientCommand(c, cmd, args, cb);
};

Disque.prototype.clientCommand = function(client, cmd, args, cb) {
  client.send_command(cmd, args, cb);
};

Disque.prototype.quit = function(cb) {
  var self = this;
  var cons = Object.keys(self.connections);
  var todo = cons.length;

  for (var i = 0; i < cons.length; i++) {
    self.connections[cons[i]].quit(function() {
      if (!--todo && cb) cb();
    });
  }
};
