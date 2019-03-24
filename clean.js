const fs = require('fs')
const homedir = require('os').homedir()
var path = require('path')

var local_fs_dir_name = '.progress'
var configDir = path.normalize(`${homedir}/${local_fs_dir_name}`)

fs.readdir(configDir, (err, files) => {
    if (err) throw err;
  
    for (const file of files) {
      fs.unlink(path.join(configDir, file), err => {
        if (err) throw err;
      });
    }
});