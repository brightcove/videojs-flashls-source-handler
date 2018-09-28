# videojs-flashls-source-handler

[![Build Status](https://travis-ci.org/brightcove/videojs-flashls-source-handler.svg?branch=master)](https://travis-ci.org/brightcove/videojs-flashls-source-handler)
[![Greenkeeper badge](https://badges.greenkeeper.io/brightcove/videojs-flashls-source-handler.svg)](https://greenkeeper.io/)
[![Slack Status](http://slack.videojs.com/badge.svg)](http://slack.videojs.com)

[![NPM](https://nodei.co/npm/@brightcove/videojs-flashls-source-handler.png?downloads=true&downloadRank=true)](https://nodei.co/npm/@brightcove/videojs-flashls-source-handler/)

A source handler to integrate flashls with video.js


<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Installation](#installation)
- [Usage](#usage)
  - [Browserify](#browserify)
  - [RequireJS/AMD](#requirejsamd)
- [License](#license)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Installation

```sh
npm install --save @brightcove/videojs-flashls-source-handler
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
require('@brightcove/videojs-flashls-source-handler');

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
