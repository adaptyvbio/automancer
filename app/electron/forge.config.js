module.exports = {
  packagerConfig: {
    extraResource: [
      'tmp/resources/alpha',
      'tmp/resources/beta'
    ],
    ignore: [
      /^build$/,
      /^tmp$/
    ],
    name: 'PR–1'
  },
  makers: [
    { name: '@electron-forge/maker-zip' }
  ]
}
