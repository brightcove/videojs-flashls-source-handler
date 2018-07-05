# videojs-flashls-source-handler

[![Build Status][travis-icon]][travis-link]
[![Slack Status][slack-icon]][slack-link]

A source handler to integrate flashls with video.js

## Installation

```sh
npm install --save videojs-flashls-source-handler
```

## Usage

To include videojs-flashls-source-handler on your website or web application, use any of the following methods.

This plugin requires the use of a [customized SWF](https://github.com/brightcove/videojs-flashls-swf) that is not included in videojs-flash.

The SWF is available on the unpkg CDN https://unpkg.com/@brightcove/videojs-flashls-source-handler/dist/video-js.swf and is provided in this project's `dist/` folder. We highly recommend hosting the SWF yourself as unpkg does not provide uptime or support guarantees.

```html
<script src="//path/to/video.min.js"></script>
<script src="//path/to/videojs-flash.min.js"></script>
<script src="//path/to/videojs-flashls-source-handler.min.js"></script>
<script>
  var player = videojs('my-video', {
    flash: {
      swf: '//path/to/swf'
    }
  });
</script>
```

__Note: The `swf` option must be set before or during player creation.__

### Browserify

When using with Browserify, install videojs-flashls-source-handler via npm and `require` the plugin as you would any other module.

```js
var videojs = require('video.js');
require('videojs-flash');

// The actual plugin function is exported by this module, but it is also
// attached to the `Player.prototype`; so, there is no need to assign it
// to a variable.
require('videojs-flashls-source-handler');

var player = videojs('my-video', {
  flash: {
    swf: '//path/to/swf'
  }
});
```

### RequireJS/AMD

When using with RequireJS (or another AMD library), get the script in whatever way you prefer and `require` the plugin as you normally would:

```js
require(['video.js', 'videojs-flash', 'videojs-flashls-source-handler'], function(videojs) {
  var player = videojs('my-video', {
    flash: {
      swf: '//path/to/swf'
    }
  });
});
```

## License

Apache-2.0. Copyright (c) Brightcove


[videojs]: http://videojs.com/
[slack-icon]: http://slack.videojs.com/badge.svg
[slack-link]: http://slack.videojs.com
[travis-icon]: https://travis-ci.org/brightcove/videojs-flashls-source-handler.svg?branch=master
[travis-link]: https://travis-ci.org/brightcove/videojs-flashls-source-handler
