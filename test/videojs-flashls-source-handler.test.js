import document from 'global/document';

import QUnit from 'qunit';
import sinon from 'sinon';
import videojs from 'video.js';

import handler from '../src/index';
import { updateAudioTrack, setupAudioTracks } from '../src/flashlsAudioTracks.js';
import { makeMochTech } from './util/util.js';

QUnit.test('the environment is sane', function(assert) {
  assert.strictEqual(typeof Array.isArray, 'function', 'es5 exists');
  assert.strictEqual(typeof sinon, 'object', 'sinon exists');
  assert.strictEqual(typeof videojs, 'function', 'videojs exists');
  assert.strictEqual(typeof handler, 'object', 'handler is a function');
});

QUnit.module('videojs-flashls-source-handler', {

  beforeEach() {

    // Mock the environment's timers because certain things - particularly
    // player readiness - are asynchronous in video.js 5. This MUST come
    // before any player is created; otherwise, timers could get created
    // with the actual timer methods!
    this.clock = sinon.useFakeTimers();
    this.fixture = document.getElementById('qunit-fixture');
    this.video = document.createElement('video');
    this.fixture.appendChild(this.video);
    this.player = videojs(this.video);
  },

  afterEach() {
    this.player.dispose();
    this.clock.restore();
  }
});

QUnit.test('Flashls Audiotracks tests', function(assert) {
  const swfAudioTracks = [
    {
      id: 0,
      enabled: true,
      kind: '',
      label: 'English',
      language: ''
    },
    {
      id: 1,
      enabled: false,
      kind: '',
      label: 'Spanish',
      language: ''
    },
    {
      id: 2,
      enabled: false,
      kind: '',
      label: 'French',
      language: ''
    }
  ];

  let vjsAudioTracks = [];
  let swfAudioTrack = 0;

  const tech = makeMochTech({
    audioTracks: () => swfAudioTracks,
    audioTrack: () => swfAudioTrack
  }, {
    audioTrack: (val) => swfAudioTrack = val
  });

  tech.audioTracks = () => {
    return vjsAudioTracks;
  };

  tech.audioTracks().addTrack = (t) => {
    vjsAudioTracks.push(t);
  };

  assert.equal(vjsAudioTracks.length, 0, 'Initial size');

  setupAudioTracks(tech);

  assert.equal(vjsAudioTracks.length, 3, 'Length after setupAudioTracks()');
  assert.equal(swfAudioTrack, 0, 'Initial Audio track which is enabled');

  vjsAudioTracks[0].enabled = false;

  updateAudioTrack(tech);
  assert.equal(swfAudioTrack, 0, 'None of the track is enabled');

  vjsAudioTracks[0].enabled = true;
  vjsAudioTracks[1].enabled = true;

  updateAudioTrack(tech);
  assert.equal(swfAudioTrack, 0,
  'When more than 1 track is enabled, set the first track in list as enabled');
  vjsAudioTracks[0].enabled = false;

  updateAudioTrack(tech);

  assert.equal(swfAudioTrack, 1, 'Enabled Audio track after switching tracks');

});
