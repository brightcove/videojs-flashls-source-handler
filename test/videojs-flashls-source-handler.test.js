import QUnit from 'qunit';
import sinon from 'sinon';
import videojs from 'video.js';

import { default as FlashlsSourceHandler, FlashlsHandler } from '../src/index';
import { makeMochTech } from './util/util.js';

QUnit.test('the environment is sane', function(assert) {
  assert.strictEqual(typeof Array.isArray, 'function', 'es5 exists');
  assert.strictEqual(typeof sinon, 'object', 'sinon exists');
  assert.strictEqual(typeof videojs, 'function', 'videojs exists');
  assert.strictEqual(typeof FlashlsSourceHandler, 'object', 'handler is a function');
});

QUnit.module('videojs-flashls-source-handler');

QUnit.test('can get stats from handler', function(assert) {
  const stats = {
    bandwidth: 100,
    mediaRequests: 1,
    mediaRequestsAborted: 2,
    mediaRequestsTimedout: 3,
    mediaRequestsErrored: 4,
    mediaTransferDuration: 5,
    mediaBytesTransferred: 6,
    mediaSecondsLoaded: 7
  };

  const tech = makeMochTech({ stats: () => stats });
  const handler = new FlashlsHandler('src', tech, {});

  assert.equal(handler.bandwidth, 100, 'can get hls.bandwidth');
  assert.deepEqual(handler.stats, stats, 'can get hls.stats');
});

QUnit.test(
  'triggers an event when bandwidth updates after segment load',
  function(assert) {
    let bandwidthupdate = 0;

    const tech = makeMochTech({});

    /* eslint-disable no-unused-vars */
    // need to create handler to setup event listeners
    const handler = new FlashlsHandler('this.m3u8', tech, {});
    /* eslint-enable no-unused-vars */

    tech.on('bandwidthupdate', () => bandwidthupdate++);

    tech.trigger('fragmentloaded');
    assert.equal(bandwidthupdate, 1, 'tech fired a bandwidthupdate');
  }
);

QUnit.test(
  'seeks to live point when playhead is outside seekable',
  function(assert) {
    let time = 0;
    const tech = makeMochTech({});

    tech.duration = () => Infinity;
    tech.currentTime = () => 0;
    tech.setCurrentTime = (t) => {
      time = t;
    };

    const handler = new FlashlsHandler('this.m3u8', tech, {});
    const seekableStart = 10;
    const seekableEnd = 20;
    const seekable = videojs.createTimeRange(seekableStart, seekableEnd);

    handler.seekable = () => seekable;

    tech.trigger('play');
    assert.equal(time, seekableEnd, 'seeked to live');
  }
);
