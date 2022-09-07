const fs = require('fs');

console.log();

module.exports = {
  packagerConfig: {
    extraResource: [
      'tmp/resources/alpha',
      'tmp/resources/beta'
    ].filter((path) => {
      try {
        fs.statSync(path);
        console.log(`Packaging resource '${path}'`);
        return true;
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log(`Skipping resource '${path}'`);
          return false;
        }

        throw err;
      }
    }),
    ignore: [
      /^\/build(\/|$)/,
      /^\/tmp(\/|$)/,
      /^\/icon\.icns$/,
      /^\/forge\.config\.js$/
    ],
    name: 'PR–1',
    icon: 'icon.icns'
  },
  makers: [
    { name: '@electron-forge/maker-zip' },
    { name: '@electron-forge/maker-squirrel',
      config: {
        authors: 'AdaptyvBio',
        description: 'Protocol Runner 1'
      } }
  ]
}
