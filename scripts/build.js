var exec = require('child_process').exec;
var binRoot = './node_modules/.bin';

function onExecFinish(err, stdout, stderr) {
  var red   = '\u001b[31m';
  var green = '\u001b[32m';
  var reset = '\u001b[0m';

  console.log(`${green}${stdout}${reset}`);
  console.log(`${red}${stderr}${reset}`);
}

function build() {
  exec(`${binRoot}/pegjs --cache src/grammer.pegjs dest/grammer.js`, onExecFinish)
  exec(`${binRoot}/babel --out-dir dest/ src/`, onExecFinish);
}

module.exports = {
  build: build
};

if(!module.parent) {
  build();
}
