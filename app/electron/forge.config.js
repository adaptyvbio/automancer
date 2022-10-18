const fs = require('fs');
const setLanguages = require('electron-packager-languages');


console.log();

module.exports = {
  packagerConfig: {
    name: 'PR–1',
    icon: 'icon.icns',
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
      /^\/forge\.config\.js$/,
      /^\/icon\.icns$/,
      /^\/jsconfig.json$/,
      /^\/node_modules(\/|$)/,
      /^\/src(\/|$)/,
      /^\/tmp(\/|$)/
    ],
    afterCopy: [
      setLanguages(['en'])
    ]
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
