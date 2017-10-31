import videojs from 'video.js';

/**
 * Updates the selected index of the audio track list with the new active track
 *
 * @param {Object} tech
 *        The flash tech
 * @function updateAudioTrack
 */
export const updateAudioTrack = (tech) => {
  const audioTracks = tech.el_.vjs_getProperty('audioTracks');
  const vjsAudioTracks = tech.audioTracks();
  let enabledTrackId = null;

  for (let i = 0; i < vjsAudioTracks.length; i++) {
    if (vjsAudioTracks[i].enabled) {
      enabledTrackId = vjsAudioTracks[i].id;
      break;
    }
  }

  if (enabledTrackId === null) {
    // no tracks enabled, do nothing
    return;
  }

  for (let i = 0; i < audioTracks.length; i++) {
    if (enabledTrackId === audioTracks[i].title) {
      tech.el_.vjs_setProperty('audioTrack', i);
      return;
    }
  }
};

/**
 * This adds the videojs audio track to the audio track list
 *
 * @param {Object} tech
 *        The flash tech
 * @function onTrackChanged
 */
export const setupAudioTracks = (tech) => {
  const altAudioTracks = tech.el_.vjs_getProperty('altAudioTracks');
  const audioTracks = tech.el_.vjs_getProperty('audioTracks');
  const enabledIndex = tech.el_.vjs_getProperty('audioTrack');

  audioTracks.forEach((track, index) => {
    const altTrack = altAudioTracks[track.id];

    tech.audioTracks().addTrack(new videojs.AudioTrack({
      id: altTrack.name,
      enabled: enabledIndex === index,
      language: altTrack.lang,
      default: altTrack.default_track,
      label: altTrack.name
    }));
  });
};
