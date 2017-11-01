import videojs from 'video.js';
import window from 'global/window';
import { Cea608Stream } from 'mux.js/lib/m2ts/caption-stream';
import MetadataStream from 'mux.js/lib/m2ts/metadata-stream';
import { createRepresentations } from './representations.js';
import { updateAudioTrack, setupAudioTracks } from './flashlsAudioTracks.js';

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

/**
 * Updates the selected index of the quality levels list and triggers a change event
 *
 * @param {QualityLevelList} qualityLevels
 *        The quality levels list
 * @param {String} id
 *        The id of the new active quality level
 * @function updateSelectedIndex
 */
const updateSelectedIndex = (qualityLevels, id) => {
  let selectedIndex = -1;

  for (let i = 0; i < qualityLevels.length; i++) {
    if (qualityLevels[i].id === id) {
      selectedIndex = i;
      break;
    }
  }

  qualityLevels.selectedIndex_ = selectedIndex;
  qualityLevels.trigger({
    selectedIndex,
    type: 'change'
  });
};

class FlashlsHandler {
  constructor(source, tech, options) {
    // tech.player() is deprecated but setup a reference to HLS for
    // backwards-compatibility
    if (tech.options_ && tech.options_.playerId) {
      let _player = videojs(tech.options_.playerId);

      if (!_player.hasOwnProperty('hls')) {
        Object.defineProperty(_player, 'hls', {
          get: () => {
            videojs.log.warn('player.hls is deprecated. Use player.tech_.hls instead.');
            tech.trigger({type: 'usage', name: 'flashls-player-access'});
            return this;
          }
        });
      }
    }

    this.tech_ = tech;
    this.metadataTrack_ = null;
    this.inbandTextTrack_ = null;
    this.metadataStream_ = new MetadataStream();
    this.cea608Stream_ = new Cea608Stream();
    this.captionPackets_ = [];

    // bind event listeners to this context
    this.onLoadedmetadata_ = this.onLoadedmetadata_.bind(this);
    this.onSeeked_ = this.onSeeked_.bind(this);
    this.onId3updated_ = this.onId3updated_.bind(this);
    this.onCaptionData_ = this.onCaptionData_.bind(this);
    this.onMetadataStreamData_ = this.onMetadataStreamData_.bind(this);
    this.onCea608StreamData_ = this.onCea608StreamData_.bind(this);
    this.onLevelSwitch_ = this.onLevelSwitch_.bind(this);
    this.onAudioTrackChanged = this.onAudioTrackChanged.bind(this);

    this.tech_.on('loadedmetadata', this.onLoadedmetadata_);
    this.tech_.on('seeked', this.onSeeked_);
    this.tech_.on('id3updated', this.onId3updated_);
    this.tech_.on('captiondata', this.onCaptionData_);

    this.metadataStream_.on('data', this.onMetadataStreamData_);
    this.cea608Stream_.on('data', this.onCea608StreamData_);
  }

  src(source) {
    // do nothing if source is falsey
    if (!source) {
      return;
    }
    this.tech_.setSrc(source.src);
  }

  /**
   * Calculates the interval of time that is currently seekable.
   *
   * @return {TimeRange}
   *         Returns the time ranges that can be seeked to.
   */
  seekable() {
    let seekableStart = this.tech_.el_.vjs_getProperty('seekableStart');
    let seekableEnd = this.tech_.el_.vjs_getProperty('seekableEnd');

    if (seekableEnd === 0) {
      return videojs.createTimeRange();
    }

    return videojs.createTimeRange(seekableStart, seekableEnd);
  }

  /**
   * Event listener for the loadedmetadata event. This sets up the representations api
   * and populates the quality levels list if it is available on the player
   */
  onLoadedmetadata_() {
    this.representations = createRepresentations(this.tech_);

    const player = videojs.players[this.tech_.options_.playerId];

    if (player && player.qualityLevels) {
      this.qualityLevels_ = player.qualityLevels();
      this.representations().forEach((representation) => {
        this.qualityLevels_.addQualityLevel(representation);
      });

      this.tech_.on('levelswitch', this.onLevelSwitch_);

      // update initial selected index
      updateSelectedIndex(this.qualityLevels_,
                          this.tech_.el_.vjs_getProperty('level') + '');
    }

    setupAudioTracks(this.tech_);
    this.tech_.audioTracks().on('change', this.onAudioTrackChanged);
  }

  /**
   * Event listener for the change event. This will update the selected index of the
   * audio track list with the new active track.
   */
  onAudioTrackChanged() {
    updateAudioTrack(this.tech_);
  }

  /**
   * Event listener for the levelswitch event. This will update the selected index of the
   * quality levels list with the new active level.
   *
   * @param {Object} event
   *        event object for the levelswitch event
   * @param {Array} level
   *        The active level will be the first element of the array
   */
  onLevelSwitch_(event, level) {
    updateSelectedIndex(this.qualityLevels_, level[0].levelIndex + '');
  }

  /**
   * Event listener for the seeked event. This will remove cues from the metadata track
   * and inband text track after seeks
   */
  onSeeked_() {
    removeCuesFromTrack(0, Infinity, this.metadataTrack_);

    let buffered = this.tech_.buffered();

    if (buffered.length === 1) {
      removeCuesFromTrack(0, buffered.start(0), this.inbandTextTrack_);
      removeCuesFromTrack(buffered.end(0), Infinity, this.inbandTextTrack_);
    } else {
      removeCuesFromTrack(0, Infinity, this.inbandTextTrack_);
    }
  }

  /**
   * Event listener for the id3updated event. This will store id3 tags recevied by flashls
   *
   * @param {Object} event
   *        event object for the levelswitch event
   * @param {Array} data
   *        The id3 tag base64 encoded will be the first element of the array
   */
  onId3updated_(event, data) {
    const id3tag = window.atob(data[0]);
    const bytes = stringToByteArray(id3tag);
    const chunk = {
      type: 'timed-metadata',
      dataAlignmentIndicator: true,
      data: bytes
    };

    this.metadataStream_.push(chunk);
  }

  /**
   * Event listener for the data event from the metadata stream. This will create cues
   * for each frame in the metadata tag and add them to the metadata track
   *
   * @param {Object} tag
   *        The metadata tag
   */
  onMetadataStreamData_(tag) {
    if (!this.metadataTrack_) {
      this.metadataTrack_ = this.tech_.addRemoteTextTrack({
        kind: 'metadata',
        label: 'Timed Metadata'
      }, false).track;

      this.metadataTrack_.inBandMetadataTrackDispatchType = '';
    }

    removeOldCues(this.tech_.buffered(), this.metadataTrack_);

    const time = this.tech_.currentTime();

    tag.frames.forEach((frame) => {
      const cue = new window.VTTCue(
        time,
        time + 0.1,
        frame.value || frame.url || frame.data || '');

      cue.frame = frame;
      cue.value = frame;

      deprecateOldCue(cue);
      this.metadataTrack_.addCue(cue);
    });

    if (this.metadataTrack_.cues && this.metadataTrack_.cues.length) {
      const cues = this.metadataTrack_.cues;
      const cuesArray = [];
      let duration = this.tech_.duration();

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

  /**
   * Event listener for the captiondata event from FlasHLS. This will parse out the
   * caption data and feed it to the CEA608 caption stream.
   *
   * @param {Object} event
   *        The captiondata event object
   * @param {Array} data
   *        The caption packets array will be the first element of data.
   */
  onCaptionData_(event, data) {
    let captions = data[0].map((d) => {
      return {
        pts: d.pos * 90000,
        bytes: stringToByteArray(window.atob(d.data))
      };
    });

    captions.forEach((caption) => {
      this.captionPackets_ = this.captionPackets_.concat(
        parseCaptionPackets(caption.pts, caption.bytes));
    });

    if (this.captionPackets_.length) {
      // In Chrome, the Array#sort function is not stable so add a
      // presortIndex that we can use to ensure we get a stable-sort
      this.captionPackets_.forEach((elem, idx) => {
        elem.presortIndex = idx;
      });

      // sort caption byte-pairs based on their PTS values
      this.captionPackets_.sort((a, b) => {
        if (a.pts === b.pts) {
          return a.presortIndex - b.presortIndex;
        }
        return a.pts - b.pts;
      });

      // Push each caption into Cea608Stream
      this.captionPackets_.forEach(this.cea608Stream_.push, this.cea608Stream_);
      this.captionPackets_.length = 0;
      this.cea608Stream_.flush();
    }
  }

  /**
   * Event listener for the data event from the CEA608 caption stream. This will create
   * cues for the captions received from the stream and add them to the inband text track
   *
   * @param {Object} caption
   *        The caption object
   */
  onCea608StreamData_(caption) {
    if (caption) {
      if (!this.inbandTextTrack_) {
        removeExistingTrack(this.tech_, 'captions', 'cc1');
        this.inbandTextTrack_ = this.tech_.addRemoteTextTrack({
          kind: 'captions',
          label: 'cc1'
        }, false).track;
      }

      removeOldCues(this.tech_.buffered(), this.inbandTextTrack_);

      this.inbandTextTrack_.addCue(
        new window.VTTCue(caption.startPts / 90000,
                          caption.endPts / 90000,
                          caption.text));
    }
  }

  dispose() {
    this.tech_.off('loadedmetadata', this.onLoadedmetadata_);
    this.tech_.off('seeked', this.onSeeked_);
    this.tech_.off('id3updated', this.onId3updated_);
    this.tech_.off('captiondata', this.onCaptionData_);
    this.tech_.audioTracks().off('change', this.onAudioTrackChanged);

    if (this.qualityLevels_) {
      this.qualityLevels_.dispose();
      this.tech_.off('levelswitch', this.onLevelSwitch_);
    }
  }
}

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
  tech.hls = new FlashlsHandler(source, tech, options);

  tech.hls.src(source);
  return tech.hls;
};

// Register the source handler and make sure it takes precedence over
// any other Flash source handlers for HLS
videojs.getTech('Flash').registerSourceHandler(FlashlsSourceHandler, 0);

// Use the flashls-enabled version of the video.js SWF
videojs.options.flash.swf = 'https://unpkg.com/@brightcove/videojs-flashls-swf/dist/video-js.swf';

// Include the version number.
FlashlsSourceHandler.VERSION = '__VERSION__';

export default FlashlsSourceHandler;
