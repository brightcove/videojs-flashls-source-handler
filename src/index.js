import videojs from 'video.js';
import window from 'global/window';

const parseSyncSafeInteger = function(data) {
  return (data.charCodeAt(0) << 21) |
          (data.charCodeAt(1) << 14) |
          (data.charCodeAt(2) << 7) |
          (data.charCodeAt(3));
};

/*
 * Registers the SWF as a handler for HLS video.
 *
 * @property {Tech~SourceObject} source
 *           The source object
 *
 * @property {Flash} tech
 *           The instance of the Flash tech
 */
const FlashlsSourceHandler = {};

const mpegurlRE = /^(audio|video|application)\/(x-|vnd\.apple\.)?mpegurl/i;

/**
 * Reports that Flash can play HLS.
 *
 * @param {string} type
 *        The mimetype to check
 *
 * @return {string}
 *         'maybe', or '' (empty string)
 */
FlashlsSourceHandler.canPlayType = function(type) {
  return mpegurlRE.test(type) ? 'maybe' : '';
};

/**
 * Returns true if the source type indicates HLS content.
 *
 * @param {Tech~SourceObject} source
 *         The source object
 *
 * @param {Object} [options]
 *         Options to be passed to the tech.
 *
 * @return {string}
 *         'maybe', or '' (empty string).
 */
FlashlsSourceHandler.canHandleSource = function(source, options) {
  return FlashlsSourceHandler.canPlayType(source.type) === 'maybe';
};

/**
 * Pass the source to the swf.
 *
 * @param {Tech~SourceObject} source
 *        The source object
 *
 * @param {Flash} tech
 *        The instance of the Flash tech
 *
 * @param {Object} [options]
 *        The options to pass to the source
 */
FlashlsSourceHandler.handleSource = function(source, tech, options) {
  tech.setSrc(source.src);

  tech.on('id3updated', (event, data) => {
    const id3tag = window.atob(data[0]);
    let frameStart = 10;

    if (id3tag.charCodeAt(5) & 0x40) {
      // advance frame start past extended header
      frameStart += 4;
      frameStart += parseSyncSafeInteger(id3tag.substring(10, 14));
    }

    const frameSize = parseSyncSafeInteger(id3tag.substring(frameStart + 4, frameStart + 8));

    if (this.metadataTrack_) {
      const Cue = window.WebKitDataCue || window.VTTCue;
      const time = tech.currentTime();
      const cue = new Cue(time,
                          time,
                          id3tag.substring(frameStart + 10, frameStart + frameSize + 10));

      this.metadataTrack_.addCue(cue);

      if (this.metadataTrack_.cues && this.metadataTrack_.cues.length) {
        const cues = this.metadataTrack_.cues;
        const cuesArray = [];
        let duration = tech.duration();

        if (isNaN(duration) || Math.abs(duration) === Infinity) {
          duration = Number.MAX_VALUE;
        }

        for (let i = 0; i < cues.length; i++) {
          cuesArray.push(cues[i]);
        }

        cuesArray.sort((a, b) => a.startTime - b.startTime);

        for (let i = 0; i < cuesArray.length - 1; i++) {
          if (cuesArray[i].endTime !== cuesArray[i + 1].startTime) {
            cuesArray[i].endTime = cuesArray[i + 1].startTime;
          }
        }
        cuesArray[cuesArray.length - 1].endTime = duration;
      }
    }
  });

  if (tech.options_ && tech.options_.playerId) {
    const _player = videojs(tech.options_.playerId);

    _player.ready(() => {
      this.metadataTrack_ = _player.addTextTrack('metadata', 'Timed Metadata')
    });
  }
};

/**
 * No extra cleanup is necessary on dispose.
 */
FlashlsSourceHandler.dispose = function() {};

// Register the source handler and make sure it takes precedence over
// any other Flash source handlers for HLS
videojs.getTech('Flash').registerSourceHandler(FlashlsSourceHandler, 0);

// Use the flashls-enabled version of the video.js SWF
videojs.options.flash.swf = 'https://players.brightcove.net/videojs-flashls/video-js.swf';

// Include the version number.
FlashlsSourceHandler.VERSION = '__VERSION__';

export default FlashlsSourceHandler;
