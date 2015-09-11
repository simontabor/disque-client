# Disque client

[![Dependencies](https://david-dm.org/simontabor/disque-client.svg)](https://david-dm.org/simontabor/disque-client)
[![Join the chat at https://gitter.im/simontabor/disque-client](https://img.shields.io/badge/gitter-join%20chat-blue.svg)](https://gitter.im/simontabor/disque-client)

[![NPM](https://nodei.co/npm/disque-client.png?downloads=true&downloadRank=true&stars=true)](https://www.npmjs.com/package/disque-client)

This module is a relatively thin wrapper around the [node_redis](https://github.com/mranney/node_redis) client to enable use of [Disque](https://github.com/antirez/disque).


## Usage


```javascript
var Disque = require('disque-client');

var disque = new Disque({
  servers: [
    {
      port: 7711,
      host: '127.0.0.1'
    }
  ]
});

disque.addjob("queue", "body", 0, function() {
  console.log(arguments);
});
```

### Servers

Servers in the cluster will be automatically connected to (via the response of `cluster nodes`). Of course, to allow discovery there must be at least one server specified in the configuration.

### Client creation

By default, clients will be created using `Redis.createClient(port, host)`. This can be overridden by providing a function which *must* return a [node_redis](https://github.com/mranney/node_redis) client. Clients are cached so only one connection will be made to each server.

```javascript
var Disque = require('disque-client');
var RedisClient = require('redis');
var disque = new Disque({
  servers: [...],
  createClient: function(port, host) {
    // this is the default behaviour
    return RedisClient.createClient(port, host);
  }
});
```
