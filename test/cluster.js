// not really tests but being used to ensure things are working
var Disque = require('../src/disque');

var c = new Disque({
  servers: [
    {
      port: 7711,
      host: '127.0.0.1'
    },
    // {
    //   port: 7001,
    //   host: '127.0.0.1'
    // },
    // {
    //   port: 7002,
    //   host: '127.0.0.1'
    // }
  ]
});


// c.getNodes(console.log);


c.addjob("queue", "body", 0, function() {
  console.log(arguments);
});
c.addjob("queue", "body", 0, function() {
  console.log(arguments);
});
c.addjob("queue", "body", 0, function() {
  console.log(arguments);
});
c.addjob("queue", "body", 0, function() {
  console.log(arguments);
});

c.getjob("COUNT", 5, "FROM", "queue", function(err, jobs) {
  console.log(arguments);

  for (var i = 0; i < jobs.length; i++) {
    c.ackjob(jobs[i][1], function(err) {
      console.log(arguments);
    })
  }
});
