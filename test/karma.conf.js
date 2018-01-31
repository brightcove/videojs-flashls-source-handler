module.exports = function(config) {
  config.set({
    basePath: '..',
    frameworks: ['qunit', 'detectBrowsers'],

    files: [
      'node_modules/sinon/pkg/sinon.js',
      'node_modules/sinon/pkg/sinon-ie.js',
      'node_modules/video.js/dist/video.js',
      'node_modules/video.js/dist/video-js.css',
      'test/dist/bundle.js'
    ],

    customLaunchers: {
      ChromeHeadlessWithFlags: {
        base: 'ChromeHeadless',
        flags: [
          '--mute-audio',
          '--no-sandbox',
          '--no-user-gesture-required'
        ]
      }
    },
    detectBrowsers: {
      usePhantomJS: false,

      // detect what browsers are installed on the system and
      // use headless mode and flags to allow for playback
      postDetection: function(browsers) {
        var newBrowsers = [];
        if (browsers.indexOf('Chrome') !== -1) {
          newBrowsers.push('ChromeHeadlessWithFlags');
        }

        if (browsers.indexOf('Firefox') !== -1) {
          newBrowsers.push('FirefoxHeadless');
        }

        return newBrowsers;
      }
    },
    reporters: ['dots'],
    port: 9876,
    colors: true,
    autoWatch: false,
    singleRun: true,
    concurrency: Infinity
  });
};
