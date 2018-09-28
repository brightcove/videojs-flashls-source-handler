import QUnit from 'qunit';
import { updateAudioTrack, setupAudioTracks } from '../src/flashlsAudioTracks.js';
import { makeMochTech } from './util/util.js';

QUnit.module('Flashls Audiotracks', {
  beforeEach() {
    this.swfAudioTracks = [];
    this.swfAltAudioTracks = [];
    this.swfAudioTrack = -1;
    this.vjsAudioTracks = [];

    this.tech = makeMochTech({
      altAudioTracks: () => this.swfAltAudioTracks,
      audioTracks: () => this.swfAudioTracks,
      audioTrack: () => this.swfAudioTrack
    }, {
      audioTrack: (val) => {
        this.swfAudioTrack = val;
      }
    });

    // mock videojs audio tracks getter
    this.vjsAudioTracks.addTrack = (track) => this.vjsAudioTracks.push(track);
    this.tech.audioTracks = () => this.vjsAudioTracks;
  }
});

QUnit.test('setupAudioTracks does nothing when no audio tracks from swf',
  function(assert) {
    setupAudioTracks(this.tech);

    assert.equal(this.vjsAudioTracks.length, 0, 'no videojs audio tracks created');
  });

QUnit.test('setupAudioTracks creates videojs audio tracks for each swf audio track',
  function(assert) {
  // org.mangui.hls.model.AudioTrack
    this.swfAudioTracks = [
      {
        id: 1,
        isDefault: true,
        isAAC: true,
        title: 'English',
        source: 1
      },
      {
        id: 3,
        isDefault: false,
        isAAC: true,
        title: 'Spanish',
        source: 1
      },
      {
        id: 5,
        isDefault: false,
        isAAC: true,
        title: 'French',
        source: 1
      }
    ];

    // org.mangui.hls.playlist.AltAudioTrack
    /* eslint-disable camelcase */
    this.swfAltAudioTracks = [
      {
        group_id: 'low',
        lang: 'en',
        name: 'English',
        default_track: true,
        autoselect: true,
        url: '0.m3u8'
      },
      {
        group_id: 'high',
        lang: 'en',
        name: 'English',
        default_track: true,
        autoselect: true,
        url: '1.m3u8'
      },
      {
        group_id: 'low',
        lang: 'es',
        name: 'Spanish',
        default_track: false,
        autoselect: true,
        url: '2.m3u8'
      },
      {
        group_id: 'high',
        lang: 'es',
        name: 'Spanish',
        default_track: false,
        autoselect: true,
        url: '3.m3u8'
      },
      {
        group_id: 'low',
        lang: 'fr',
        name: 'French',
        default_track: false,
        autoselect: true,
        url: '4.m3u8'
      },
      {
        group_id: 'high',
        lang: 'fr',
        name: 'French',
        default_track: false,
        autoselect: true,
        url: '5.m3u8'
      }
    ];
    /* eslint-enable camelcase */

    // set initial selection of swf audio track made by flashls
    this.swfAudioTrack = 0;

    assert.equal(this.vjsAudioTracks.length, 0, 'Initial size of vjsAudioTracks');

    setupAudioTracks(this.tech);

    assert.equal(this.vjsAudioTracks.length, 3, 'Length after setupAudioTracks()');
    assert.equal(this.vjsAudioTracks[0].id, 'English', 'corrrect id');
    assert.equal(this.vjsAudioTracks[0].enabled, true, 'correct audio track enabled');
    assert.equal(this.vjsAudioTracks[1].id, 'Spanish', 'corrrect id');
    assert.equal(this.vjsAudioTracks[1].enabled, false, 'Other Audio track are disabled');
    assert.equal(this.vjsAudioTracks[2].id, 'French', 'corrrect id');
    assert.equal(this.vjsAudioTracks[2].enabled, false, 'Other Audio track are disabled');
  });

QUnit.test('updateAudioTrack sets audioTrack on swf when videojs audioTrack changes',
  function(assert) {
  // org.mangui.hls.model.AudioTrack
    this.swfAudioTracks = [
      {
        id: 1,
        isDefault: true,
        isAAC: true,
        title: 'English',
        source: 1
      },
      {
        id: 3,
        isDefault: false,
        isAAC: true,
        title: 'Spanish',
        source: 1
      },
      {
        id: 5,
        isDefault: false,
        isAAC: true,
        title: 'French',
        source: 1
      }
    ];

    this.vjsAudioTracks.push({
      id: 'English',
      label: 'English',
      enabled: false,
      language: 'en',
      default: true
    }, {
      id: 'Spanish',
      label: 'Spanish',
      enabled: false,
      language: 'es',
      default: false
    }, {
      id: 'French',
      label: 'French',
      enabled: false,
      language: 'fr',
      default: false
    });

    this.swfAudioTrack = -1;
    updateAudioTrack(this.tech);
    assert.equal(this.swfAudioTrack, -1,
      'When all tracks are disabled, it does not set any track');

    this.vjsAudioTracks[1].enabled = true;
    this.vjsAudioTracks[2].enabled = true;

    this.swfAudioTrack = -1;
    updateAudioTrack(this.tech);
    assert.equal(this.swfAudioTrack, 1,
      'When more than 1 track enabled, set the swf audio track to the first enabled track');

    this.vjsAudioTracks[1].enabled = false;
    this.swfAudioTrack = -1;
    updateAudioTrack(this.tech);
    assert.equal(this.swfAudioTrack, 2,
      'Correct enabled audio track id after switching tracks');
  });
