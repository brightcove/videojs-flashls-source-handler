import videojs from 'video.js';
import window from 'global/window';
import {Cea608Stream} from 'mux.js/lib/m2ts/caption-stream';

const parseSyncSafeInteger = function(data) {
  return (data.charCodeAt(0) << 21) |
          (data.charCodeAt(1) << 14) |
          (data.charCodeAt(2) << 7) |
          (data.charCodeAt(3));
};

const removeExistingTrack = function(tech, kind, label) {
  const tracks = tech.remoteTextTracks() || [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];

    if (track.kind === kind && track.label === label) {
      tech.removeRemoteTextTrack(track);
    }
  }
};

// see CEA-708-D, section 4.4
const parseCaptionPackets = (pts, userData) => {
  var results = [], i, count, offset, data;

  // if this is just filler, return immediately
  if (!(userData[0] & 0x40)) {
    return results;
  }

  // parse out the cc_data_1 and cc_data_2 fields
  count = userData[0] & 0x1f;
  for (i = 0; i < count; i++) {
    offset = i * 3;
    data = {
      type: userData[offset + 2] & 0x03,
      pts: pts
    };

    // capture cc data when cc_valid is 1
    if (userData[offset + 2] & 0x04) {
      data.ccData = (userData[offset + 3] << 8) | userData[offset + 4];
      results.push(data);
    }
  }
  return results;
};

/**
 * Remove cues from a track on video.js.
 *
 * @param {Double} start start of where we should remove the cue
 * @param {Double} end end of where the we should remove the cue
 * @param {Object} track the text track to remove the cues from
 * @private
 */
const removeCuesFromTrack = function(start, end, track) {
  let i;
  let cue;

  if (!track) {
    return;
  }

  if (!track.cues) {
    return;
  }

  i = track.cues.length;

  while (i--) {
    cue = track.cues[i];

    // Remove any overlapping cue
    if (cue.startTime <= end && cue.endTime >= start) {
      track.removeCue(cue);
    }
  }
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

  this.tech = tech;

  let cea608Stream = new Cea608Stream();
  let captionPackets = [];
  let inbandTextTrack;

  this.onSeeked = () => {
    removeCuesFromTrack(0, Infinity, this.metadataTrack_);

    let buffered = tech.buffered();

    if (buffered.length === 1) {
      removeCuesFromTrack(0, buffered.start(0), inbandTextTrack);
      removeCuesFromTrack(buffered.end(0), Infinity, inbandTextTrack);
    } else {
      removeCuesFromTrack(0, Infinity, inbandTextTrack);
    }
  };

  this.onId3updated = (event, data) => {
    const id3tag = window.atob(data[0]);
    let frameStart = 10;

    if (id3tag.charCodeAt(5) & 0x40) {
      // advance frame start past extended header
      frameStart += 4;
      frameStart += parseSyncSafeInteger(id3tag.substring(10, 14));
    }

    const frameSize = parseSyncSafeInteger(id3tag.substring(frameStart + 4, frameStart + 8));

    if (this.metadataTrack_) {
      const time = tech.currentTime();
      const cue = new window.VTTCue(
        time,
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
  };

  if (tech.options_ && tech.options_.playerId) {
    const _player = videojs(tech.options_.playerId);

    _player.ready(() => {
      this.metadataTrack_ = _player.addRemoteTextTrack({
        kind: 'metadata',
        label: 'Timed Metadata'
      }, true).track;

      this.metadataTrack_.inBandMetadataTrackDispatchType = '';
    });
  }

  cea608Stream.on('data', (caption) => {
    if (caption) {
      if (!inbandTextTrack) {
        removeExistingTrack(tech, 'captions', 'cc1');
        inbandTextTrack = tech.addRemoteTextTrack({
          kind: 'captions',
          label: 'cc1'
        }, true).track;
      }

      inbandTextTrack.addCue(
        new window.VTTCue(caption.startPts / 90000,
                          caption.endPts / 90000,
                          caption.text));
    }
  });

  this.onCaptiondata = (event, data) => {
    let captions = data[0].map((d) => {
      return {
        pts: d.pos * 90000,
        bytes: new Uint8Array(window.atob(d.data).split('').map((c) => {
          return c.charCodeAt(0);
        }))
      };
    });

    captions.forEach((caption) => {
      captionPackets = captionPackets.concat(
        parseCaptionPackets(caption.pts, caption.bytes));
    });

    if (captionPackets.length) {
      // In Chrome, the Array#sort function is not stable so add a
      // presortIndex that we can use to ensure we get a stable-sort
      captionPackets.forEach((elem, idx) => {
        elem.presortIndex = idx;
      });

      // sort caption byte-pairs based on their PTS values
      captionPackets.sort((a, b) => {
        if (a.pts === b.pts) {
          return a.presortIndex - b.presortIndex;
        }
        return a.pts - b.pts;
      });

      // Push each caption into Cea608Stream
      captionPackets.forEach(cea608Stream.push, cea608Stream);
      captionPackets.length = 0;
      cea608Stream.flush();
    }
  };

  tech.on('seeked', this.onSeeked);
  tech.on('id3updated', this.onId3updated);
  tech.on('captiondata', this.onCaptiondata);
};

FlashlsSourceHandler.dispose = function() {
  this.tech.off('seeked', this.onSeeked);
  this.tech.off('id3updated', this.onId3updated);
  this.tech.off('captiondata', this.onCaptiondata);
};

// Register the source handler and make sure it takes precedence over
// any other Flash source handlers for HLS
videojs.getTech('Flash').registerSourceHandler(FlashlsSourceHandler, 0);

// Use the flashls-enabled version of the video.js SWF
videojs.options.flash.swf = 'https://players.brightcove.net/videojs-flashls/video-js.swf';

// Include the version number.
FlashlsSourceHandler.VERSION = '__VERSION__';

export default FlashlsSourceHandler;
