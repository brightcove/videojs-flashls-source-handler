import QUnit from 'qunit';
import { createRepresentation, createRepresentations } from '../src/representations.js';
import { makeMochTech } from '../util/util.js';

QUnit.module('Representations API');

QUnit.test('creates a representation with a working enabled function', function(assert) {
  let enabledChanges = 0;
  const onEnabledChange = () => enabledChanges++;
  const level = {
    index: 0,
    width: 1280,
    height: 720,
    bitrate: 12140000
  };

  const representation = createRepresentation(onEnabledChange, level);

  assert.strictEqual(representation.id, '0', 'correct id');
  assert.equal(representation.width, 1280, 'correct width');
  assert.equal(representation.height, 720, 'correct height');
  assert.equal(representation.bandwidth, 12140000, 'correct bandwidth');
  assert.equal(typeof representation.enabled, 'function', 'has enabled function');

  let isEnabled = representation.enabled();

  assert.ok(isEnabled, 'new representations start enabled');
  assert.equal(enabledChanges, 0, 'getting enabled does not call enabled callback');

  // set enabled to same value: true -> true
  representation.enabled(true);
  isEnabled = representation.enabled();

  assert.ok(isEnabled, 'setting enabled to same value has no change');
  assert.equal(enabledChanges, 0,
    'setting enabled to the same value does not call enabled callback');

  // set enabled to different value: true -> false
  representation.enabled(false);
  isEnabled = representation.enabled();

  assert.notOk(isEnabled, 'setting enabled to different value updates enabled');
  assert.equal(enabledChanges, 1,
    'setting enabled to different value calls enabled callback');

  // set enabled to non boolean
  representation.enabled('true');
  isEnabled = representation.enabled();

  assert.notOk(isEnabled, 'setting enabled to non boolean does not update enabled');
  assert.equal(enabledChanges, 1,
    'setting enabled to non boolean does not call enabled callback');
});

QUnit.test('createRepresentations creates a list of representation objects',
function(assert) {
  const levels = [
    {
      index: 0,
      width: 640,
      height: 360,
      bitrate: 865000
    },
    {
      index: 1,
      width: 1280,
      height: 720,
      bitrate: 12140000
    },
    {
      index: 2,
      width: void 0,
      height: void 0,
      bitrate: 65000,
      audio: true
    },
    {
      index: 3,
      width: 1920,
      height: 1080,
      bitrate: 16120000
    }
  ];
  const tech = makeMochTech({ levels: () => levels }, {});

  const representationsApi = createRepresentations(tech);

  assert.equal(typeof representationsApi, 'function',
    'createRepresentations returns a function for getting the list of representations');

  const representations = representationsApi();

  assert.equal(representations.length, 3, 'created a list of representations');
  assert.equal(representations[0].id, '0', 'created representation for video');
  assert.equal(representations[1].id, '1', 'created representation for video');
  assert.equal(representations[2].id, '3', 'created representation for video');
});

QUnit.test('representations sets levels on tech correctly when enabling/disabling',
function(assert) {
  const levels = [
    {
      index: 0,
      width: 640,
      height: 360,
      bitrate: 865000
    },
    {
      index: 1,
      width: 1280,
      height: 720,
      bitrate: 12140000
    },
    {
      index: 2,
      width: 1920,
      height: 1080,
      bitrate: 16120000
    }
  ];
  let currentLevel = -1;
  let autoLevelCapping = -1;
  const tech = makeMochTech({ levels: () => levels }, {
    level: (val) => currentLevel = val,
    autoLevelCapping: (val) => autoLevelCapping = val
  });
  const representations = createRepresentations(tech)();

  assert.deepEqual(representations.map(rep => rep.enabled()), [true, true, true],
    'all representations enabled on creation');
  assert.equal(currentLevel, -1, 'auto level mode');
  assert.equal(autoLevelCapping, -1, 'no autoLevelCapping');

  representations[2].enabled(false);
  assert.equal(currentLevel, -1,
    'auto level mode when more than one representation is enabled');
  assert.equal(autoLevelCapping, 1, 'autoLevelCapping set to highest enabled bitrate');

  representations[2].enabled(true);
  assert.equal(currentLevel, -1, 'auto level mode when all enabled');
  assert.equal(autoLevelCapping, -1, 'no autoLevelCapping when all enabled');

  representations[2].enabled(false);
  representations[0].enabled(false);
  assert.equal(currentLevel, 1, 'manual level mode when only one enabled representation');
  assert.equal(autoLevelCapping, -1, 'no autoLevelCapping in manual level mode');

  representations[1].enabled(false);
  assert.equal(currentLevel, -1, 'auto level mode when all disabled');
  assert.equal(autoLevelCapping, -1, 'no autoLevelCapping when all disabled');
});
