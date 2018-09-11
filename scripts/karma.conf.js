const generate = require('videojs-generate-karma-config');

module.exports = function(config) {

  // see https://github.com/videojs/videojs-generate-karma-config
  // for options
  const options = {
    files(defaults) {
      const testBundle = defaults.pop();

      return defaults.concat([
        'node_modules/videojs-flash/dist/videojs-flash.js',
        testBundle
      ]);
    }
  };

  config = generate(config, options);

  // any other custom stuff not supported by options here!
};
