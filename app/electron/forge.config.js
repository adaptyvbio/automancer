module.exports = {
  packagerConfig: {
    extraResource: [
      'tmp/host'
    ],
    ignore: [
      /^renderer\.js$/,
      /^tmp$/
    ],
    name: 'PR–1'
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    }
  ]
}
