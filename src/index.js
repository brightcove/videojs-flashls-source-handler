import videojs from 'video.js';
import window from 'global/window';
import { Cea608Stream } from 'mux.js/lib/m2ts/caption-stream';
import MetadataStream from 'mux.js/lib/m2ts/metadata-stream';

/**
 * Define properties on a cue for backwards compatability,
 * but warn the user that the way that they are using it
 * is depricated and will be removed at a later date.
 *
 * @param {Cue} cue the cue to add the properties on
 * @private
 */
const deprecateOldCue = function(cue) {
  Object.defineProperties(cue.frame, {
    id: {
      get() {
        videojs.log.warn(
          'cue.frame.id is deprecated. Use cue.value.key instead.'
        );
        return cue.value.key;
      }
    },
    value: {
      get() {
        videojs.log.warn(
          'cue.frame.value is deprecated. Use cue.value.data instead.'
        );
        return cue.value.data;
      }
    },
    privateData: {
      get() {
        videojs.log.warn(
          'cue.frame.privateData is deprecated. Use cue.value.data instead.'
        );
        return cue.value.data;
      }
    }
  });
};

/**
 * Remove text track from tech
 */
const removeExistingTrack = function(tech, kind, label) {
  const tracks = tech.remoteTextTracks() || [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];

    if (track.kind === kind && track.label === label) {
      tech.removeRemoteTextTrack(track);
    }
  }
};

/**
 * convert a string to a byte array of char codes
 */
const stringToByteArray = function(data) {
  const bytes = new Uint8Array(data.length);

  for (let i = 0; i < data.length; i++) {
    bytes[i] = data.charCodeAt(i);
  }

  return bytes;
};

// see CEA-708-D, section 4.4
const parseCaptionPackets = function(pts, userData) {
  let results = [];
  let i;
  let count;
  let offset;
  let data;

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
      pts
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

/**
 * Removes cues from the track that come before the start of the buffer
 *
 * @param {TimeRanges} buffered state of the buffer
 * @param {TextTrack} track track to remove cues from
 * @private
 * @function removeOldCues
 */
const removeOldCues = function(buffered, track) {
  if (buffered.length) {
    removeCuesFromTrack(0, buffered.start(0), track);
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
 * Calculates the interval of time that is currently seekable. 
 * 
 *@return {TimeRange}
 *         Returns the time ranges that can be seeked to.
 */
FlashlsSourceHandler.seekable = function() {
  let seekableStart = this.tech.el_.vjs_getProperty('seekStart');
  let seekableEnd = this.tech.el_.vjs_getProperty('seekEnd');

  if (seekableEnd === 0){
    return videojs.createTimeRange();
  }
  return videojs.createTimeRange(seekableStart, seekableEnd)
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
  this.tech = tech;

  const cea608Stream = new Cea608Stream();
  const metadataStream = new MetadataStream();

  let captionPackets = [];
  let inbandTextTrack;
  let metadataTrack;

  this.onSeeked = () => {
    removeCuesFromTrack(0, Infinity, metadataTrack);

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
    const bytes = stringToByteArray(id3tag);
    const chunk = {
      type: 'timed-metadata',
      dataAlignmentIndicator: true,
      data: bytes
    };

    metadataStream.push(chunk);
  };

  metadataStream.on('data', (tag) => {
    if (!metadataTrack) {
      metadataTrack = tech.addRemoteTextTrack({
        kind: 'metadata',
        label: 'Timed Metadata'
      }, true).track;

      metadataTrack.inBandMetadataTrackDispatchType = '';
    }

    removeOldCues(tech.buffered(), metadataTrack);

    const time = tech.currentTime();

    tag.frames.forEach((frame) => {
      const cue = new window.VTTCue(
        time,
        time + 0.1,
        frame.value || frame.url || frame.data || '');

      cue.frame = frame;
      cue.value = frame;

      deprecateOldCue(cue);
      metadataTrack.addCue(cue);
    });

    if (metadataTrack.cues && metadataTrack.cues.length) {
      const cues = metadataTrack.cues;
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
  });

  cea608Stream.on('data', (caption) => {
    if (caption) {
      if (!inbandTextTrack) {
        removeExistingTrack(tech, 'captions', 'cc1');
        inbandTextTrack = tech.addRemoteTextTrack({
          kind: 'captions',
          label: 'cc1'
        }, true).track;
      }

      removeOldCues(tech.buffered(), inbandTextTrack);

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
        bytes: stringToByteArray(window.atob(d.data))
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

  tech.setSrc(source.src);
  return this;
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
