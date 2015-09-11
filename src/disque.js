var setupCommands = require('./setupCommands');
var redis = require('redis');
var Events = require('events').EventEmitter;
var util = require('util');

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

  for (var i = 0; i < config.servers.length; i++) {
    var c = config.servers[i];

    var name = c.host + ':' + c.port;
    self.connections[name] = self.getClient(c.port, c.host);
  }

  // fetch nodes from the cluster immediately
  self.getNodes();

  // ability to update nodes on an interval
  if (config.nodeInterval) setInterval(self.getNodes.bind(self), config.nodeInterval);
};

util.inherits(Disque, Events);

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
      self.getSlots();
      return;
    }

    // re-emit the error ourselves
    self.emit('error', err, cli);
  });

  return (self.connections[name] = cli);
};

Disque.prototype.getRandomConnection = function(exclude) {
  var self = this;

  var available = Object.keys(self.connections).filter(function(f) {
    return f && (!exclude || exclude.indexOf(f) === -1);
  });

  var randomIndex = Math.floor(Math.random() * available.length);
  return self.connections[available[randomIndex]];
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

    client.send_command('cluster', [ 'nodes' ], function(err, nodes) {
      if (err) {
        // exclude this client from then next attempt
        exclude.push(client.address);
        return tryClient();
      }

      nodes = nodes.split('\n').filter(Boolean);

      var seenClients = [];

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i].split(' ');
        var name = n[1];
        var cli = name.split(':');
        seenClients.push(name);
        self.connections[name] = self.getClient(cli[1], cli[0]);
      }

      // quit now-unused clients
      for (var i in self.connections) {
        if (!self.connections[i]) continue;
        if (seenClients.indexOf(i) === -1) {
          self.connections[i].quit();
          self.connections[i] = null;
        }
      }

      runCbs(null, self.connections);
    });
  };

  tryClient();
};

Disque.prototype.selectClient = function() {
  var self = this;

  return self.getRandomConnection();
};

Disque.prototype.command = function(cmd, args, cb) {
  var self = this;

  var r = self.selectClient();
  if (!r) return cb(new Error('couldn\'t get client'));

  r.send_command(cmd, args, cb);
};

setupCommands(Disque);


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
