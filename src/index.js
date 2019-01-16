import videojs from 'video.js';
import window from 'global/window';
import { CaptionStream } from 'mux.js/lib/m2ts/caption-stream';
import MetadataStream from 'mux.js/lib/m2ts/metadata-stream';
import { createRepresentations } from './representations.js';
import { updateAudioTrack, setupAudioTracks } from './flashlsAudioTracks.js';
import {version as VERSION} from '../package.json';

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
        videojs.log.warn('cue.frame.id is deprecated. Use cue.value.key instead.');
        return cue.value.key;
      }
    },
    value: {
      get() {
        videojs.log.warn('cue.frame.value is deprecated. Use cue.value.data instead.');
        return cue.value.data;
      }
    },
    privateData: {
      get() {
        videojs.log.warn('cue.frame.privateData is deprecated. Use cue.value.data instead.');
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
 * @param {string} id
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

// Fudge factor to account for TimeRanges rounding
const TIME_FUDGE_FACTOR = 1 / 30;

const filterRanges = function(timeRanges, predicate) {
  const results = [];

  if (timeRanges && timeRanges.length) {
    // Search for ranges that match the predicate
    for (let i = 0; i < timeRanges.length; i++) {
      if (predicate(timeRanges.start(i), timeRanges.end(i))) {
        results.push([timeRanges.start(i), timeRanges.end(i)]);
      }
    }
  }

  return videojs.createTimeRanges(results);
};

/**
 * Attempts to find the buffered TimeRange that contains the specified
 * time.
 *
 * @param {TimeRanges} buffered - the TimeRanges object to query
 * @param {number} time  - the time to filter on.
 * @return {TimeRanges} a new TimeRanges object
 */
const findRange = function(buffered, time) {
  return filterRanges(buffered, function(start, end) {
    return start - TIME_FUDGE_FACTOR <= time &&
      end + TIME_FUDGE_FACTOR >= time;
  });
};

export class FlashlsHandler {
  constructor(source, tech, options) {
    // tech.player() is deprecated but setup a reference to HLS for
    // backwards-compatibility
    if (tech.options_ && tech.options_.playerId) {
      const _player = videojs(tech.options_.playerId);

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

    Object.defineProperties(this, {
      stats: {
        get() {
          return this.tech_.el_.vjs_getProperty('stats');
        }
      },
      bandwidth: {
        get() {
          return this.tech_.el_.vjs_getProperty('stats').bandwidth;
        }
      }
    });

    this.tech_ = tech;
    this.metadataTrack_ = null;
    this.inbandTextTracks_ = {};
    this.metadataStream_ = new MetadataStream();
    this.captionStream_ = new CaptionStream();
    this.offsetPts = null;
    this.offsetDts = null;

    // bind event listeners to this context
    this.onLoadedmetadata_ = this.onLoadedmetadata_.bind(this);
    this.onSeeking_ = this.onSeeking_.bind(this);
    this.onId3updated_ = this.onId3updated_.bind(this);
    this.onCaptionData_ = this.onCaptionData_.bind(this);
    this.onMetadataStreamData_ = this.onMetadataStreamData_.bind(this);
    this.onCaptionStreamData_ = this.onCaptionStreamData_.bind(this);
    this.onLevelSwitch_ = this.onLevelSwitch_.bind(this);
    this.onLevelLoaded_ = this.onLevelLoaded_.bind(this);
    this.onFragmentLoaded_ = this.onFragmentLoaded_.bind(this);
    this.onAudioTrackChanged = this.onAudioTrackChanged.bind(this);
    this.onPlay_ = this.onPlay_.bind(this);

    this.tech_.on('loadedmetadata', this.onLoadedmetadata_);
    this.tech_.on('seeking', this.onSeeking_);
    this.tech_.on('id3updated', this.onId3updated_);
    this.tech_.on('captiondata', this.onCaptionData_);
    this.tech_.on('levelswitch', this.onLevelSwitch_);
    this.tech_.on('levelloaded', this.onLevelLoaded_);
    this.tech_.on('fragmentloaded', this.onFragmentLoaded_);
    this.tech_.on('play', this.onPlay_);

    this.metadataStream_.on('data', this.onMetadataStreamData_);
    this.captionStream_.on('data', this.onCaptionStreamData_);

    this.playlists = new videojs.EventTarget();
    this.playlists.media = () => this.media_();
  }

  src(source) {
    // do nothing if source is falsey
    if (!source) {
      return;
    }
    this.tech_.setSrc(source.src);
  }

  onPlay_() {
    // if the viewer has paused and we fell out of the live window,
    // seek forward to the live point
    if (this.tech_.duration() === Infinity) {
      const seekable = this.seekable();

      if (this.tech_.currentTime() < seekable.start(0)) {
        return this.tech_.setCurrentTime(seekable.end(seekable.length - 1));
      }
    }
  }

  /**
   * Calculates the interval of time that is currently seekable.
   *
   * @return {TimeRange}
   *         Returns the time ranges that can be seeked to.
   */
  seekable() {
    const seekableStart = this.tech_.el_.vjs_getProperty('seekableStart');
    const seekableEnd = this.tech_.el_.vjs_getProperty('seekableEnd');

    if (seekableEnd === 0) {
      return videojs.createTimeRange();
    }

    return videojs.createTimeRange(seekableStart, seekableEnd);
  }

  media_() {
    const levels = this.tech_.el_.vjs_getProperty('levels');
    const level = this.tech_.el_.vjs_getProperty('level');
    let media;

    if (levels.length) {
      media = {
        resolvedUri: levels[level].url,
        attributes: {
          BANDWIDTH: levels[level].bitrate,
          RESOLUTION: {
            width: levels[level].width,
            height: levels[level].height
          }
        }
      };
    }

    return media;
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

      // update initial selected index
      updateSelectedIndex(
        this.qualityLevels_,
        this.tech_.el_.vjs_getProperty('level') + ''
      );
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
    if (this.qualityLevels_) {
      updateSelectedIndex(this.qualityLevels_, level[0].levelIndex + '');
    }
    this.playlists.trigger('mediachange');
    this.tech_.trigger({ type: 'mediachange', bubbles: true});
  }

  /**
   * Event listener for the levelloaded event.
   */
  onLevelLoaded_() {
    this.playlists.trigger('loadedplaylist');
  }

  /**
   * Event listener for the fragmentloaded event.
   */
  onFragmentLoaded_() {
    this.tech_.trigger('bandwidthupdate');
    this.captionStream_.flush();
  }

  /**
   * Event listener for the seeking event. This will remove cues from the metadata track
   * and inband text tracks during seeks
   */
  onSeeking_() {
    removeCuesFromTrack(0, Infinity, this.metadataTrack_);

    const buffered = findRange(this.tech_.buffered(), this.tech_.currentTime());

    if (!buffered.length) {
      Object.keys(this.inbandTextTracks_).forEach((id) => {
        removeCuesFromTrack(0, Infinity, this.inbandTextTracks_[id]);
      });
      this.captionStream_.reset();
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
        frame.value || frame.url || frame.data || ''
      );

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
    data[0].forEach((d) => {
      if (!this.offsetPts) {
        this.offsetPts = d.pos;
      }

      if (!this.offsetDts) {
        this.offsetDts = d.dts;
      }

      this.captionStream_.push({
        pts: (d.pos - this.offsetPts) * 90000,
        dts: (d.dts - this.offsetDts) * 90000,
        escapedRBSP: stringToByteArray(window.atob(d.data)),
        nalUnitType: 'sei_rbsp'
      });
    });
  }

  /**
   * Event listener for the data event from the CEA608 caption stream. This will create
   * cues for the captions received from the stream and add them to the inband text track
   *
   * @param {Object} caption
   *        The caption object
   */
  onCaptionStreamData_(caption) {
    if (caption) {
      if (!this.inbandTextTracks_[caption.stream]) {
        removeExistingTrack(this.tech_, 'captions', caption.stream);
        this.inbandTextTracks_[caption.stream] = this.tech_.addRemoteTextTrack({
          kind: 'captions',
          label: caption.stream,
          id: caption.stream
        }, false).track;
      }

      removeOldCues(this.tech_.buffered(), this.inbandTextTracks_[caption.stream]);

      this.inbandTextTracks_[caption.stream].addCue(new window.VTTCue(
        caption.startPts / 90000,
        caption.endPts / 90000,
        caption.text
      ));
    }
  }

  dispose() {
    this.tech_.off('loadedmetadata', this.onLoadedmetadata_);
    this.tech_.off('seeked', this.onSeeking_);
    this.tech_.off('id3updated', this.onId3updated_);
    this.tech_.off('captiondata', this.onCaptionData_);
    this.tech_.audioTracks().off('change', this.onAudioTrackChanged);
    this.tech_.off('levelswitch', this.onLevelSwitch_);
    this.tech_.off('levelloaded', this.onLevelLoaded_);
    this.tech_.off('fragmentloaded', this.onFragmentLoaded_);
    this.tech_.off('play', this.onPlay_);

    if (this.qualityLevels_) {
      this.qualityLevels_.dispose();
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

// Include the version number.
FlashlsSourceHandler.VERSION = VERSION;

export default FlashlsSourceHandler;
