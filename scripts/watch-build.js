var chokidar = require('chokidar');
var build = require('./build.js').build;

chokidar.watch('./src', {ignored: /[\/\\]\./})
  .on('change', (path, event) => { build(); })
  .on('unlink', (event, path) => { build(); });
