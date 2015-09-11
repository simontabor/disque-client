var commands = require('../config/commands');

module.exports = function(Class) {
  function setupCommand(cmd) {
    Class.prototype[cmd] = function(args, cb) {
      if (Array.isArray(args) && typeof cb === 'function') {
        this.command(cmd, args, cb);
      } else {
        args = Array.prototype.slice.call(arguments);
        if (typeof args[args.length - 1] === 'function') cb = args.pop();
        this.command(cmd, args, cb);
      }
      return this;
    };
  };

  for (var i = 0; i < commands.length; i++) {
    setupCommand(commands[i].replace(/ /g, '_'));
  }
}
