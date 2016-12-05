module.exports = function(config) {
  var detectBrowsers = {
      enabled: false,
      usePhantomJS: false
    },
    browsers = config.browsers,
    reporters = ['dots'];

  // On TC CI, we can only run in Browserstack.
  if (process.env.BROWSER_STACK_USERNAME) {
    browsers = ['chrome_bs'];
    reporters = ['teamcity'];
  }

  // If no browsers are specified, we enable `karma-detect-browsers`
  // this will detect all browsers that are available for testing
  if (!config.browsers.length) {
    detectBrowsers.enabled = true;
  }

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

    browsers: browsers,

    customLaunchers: {
      chrome_bs: {
        base: 'BrowserStack',
        browser: 'chrome',
        os: 'Windows',
        os_version: '8.1'
      }
    },

    detectBrowsers: detectBrowsers,
    reporters: reporters,
    port: 9876,
    colors: true,
    autoWatch: false,
    singleRun: true,
    concurrency: Infinity
  });
};
