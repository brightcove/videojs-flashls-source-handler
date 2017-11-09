import QUnit from 'qunit';
import { makeMochTech } from './util/util.js';
import sinon from 'sinon';
import { FlashlsHandler } from '../src/index.js';

QUnit.module('Flashls playlists', {
  beforeEach() {
    this.clock = sinon.useFakeTimers();
  },
  afterEach() {
    this.clock.restore();
  }
});

QUnit.test('triggers an event when the active media changes', function(assert) {
  let mediaChange = 0;
  const levels = [
    {
      index: 0,
      width: 640,
      height: 360,
      bitrate: 865000,
      url: 'playlist-0-uri'
    },
    {
      index: 1,
      width: 1280,
      height: 720,
      bitrate: 12140000,
      url: 'playlist-1-uri'
    },
    {
      index: 2,
      width: 1920,
      height: 1080,
      bitrate: 16120000,
      url: 'playlist-2-uri'
    }
  ];

  let currentLevel = -1;

  const tech = makeMochTech({ levels: () => levels, level: () => currentLevel},
    {level: (val) => currentLevel = val});

  const handler = new FlashlsHandler('this.m3u8', tech, {});

  // change level, trigger levelswitch that should update the playlist and then call it?
  currentLevel = 0;
  tech.trigger('levelswitch');

  tech.on('mediachange', () => {
    mediaChange++;
  });

  assert.equal(mediaChange, 0, 'Initial selection is not a media changing');

  currentLevel = 1;
  tech.trigger('levelswitch');
  assert.equal(mediaChange, 1, 'fired a mediachange');

  let media = handler.playlists.media();

  assert.equal(media.resolvedUri, 'playlist-1-uri', 'correct resolvedUri');
  assert.equal(media.attributes.BANDWIDTH, 12140000, 'correct BANDWIDTH');
  assert.equal(media.attributes.RESOLUTION.width, 1280, 'correct width');
  assert.equal(media.attributes.RESOLUTION.height, 720, 'correct height');
});
