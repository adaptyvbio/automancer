const fs = require('fs');
const setLanguages = require('electron-packager-languages');


console.log();

module.exports = {
  packagerConfig: {
    name: 'Automancer',
    icon: 'icon.icns',
    ignore: [
      /^\/forge\.config\.js$/,
      /^\/icon\.icns$/,
      /^\/lib\/types(\/|$)/,
      /^\/node_modules(\/|$)/,
      /^\/scripts(\/|$)/,
      /^\/src(\/|$)/,
      /^\/tsconfig(?:\.[^\/]*)?\.json$/,
      /^\/tmp(\/|$)/
    ],
    afterCopy: [
      setLanguages(['en', 'en_US'])
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
