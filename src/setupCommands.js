'use strict';
var commands = require('../config/commands');

module.exports = function(Class) {
  function setupCommand(cmd) {
    Class.prototype[cmd] = function(args, cb) {
      if (!Array.isArray(args) || typeof cb !== 'function') {
        args = Array.prototype.slice.call(arguments);
        if (typeof args[args.length - 1] === 'function') cb = args.pop();
      }

      this.command(cmd, args, cb);
      return this;
    };

    Class.prototype['client_' + cmd] = function(client, args, cb) {
      if (!Array.isArray(args) || typeof cb !== 'function') {
        args = Array.prototype.slice.call(arguments);
        client = args.shift();
        if (typeof args[args.length - 1] === 'function') cb = args.pop();
      }

      this.clientCommand(client, cmd, args, cb);
      return this;
    };
  }

  for (var i = 0; i < commands.length; i++) {
    setupCommand(commands[i].replace(/ /g, '_'));
  }
};
