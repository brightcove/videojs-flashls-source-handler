import videojs from 'video.js';

/**
 * Updates the selected index of the audio track list with the new active track
 *
 * @param {Object} tech
 *        The flash tech
 * @function updateAudioTrack
 */
export const updateAudioTrack = (tech) => {
  tech.audioTracks().tracks_.forEach((track) => {
    if (track.enabled) {
      tech.el_.vjs_setProperty('audioTrack', track.id);
    }
  });
};

/**
 * This adds the videojs audio track to the audio track list
 *
 * @param {Object} tech
 *        The flash tech
 * @function onTrackChanged
 */
export const onTrackChanged = (tech) => {
  let audioTracks = tech.el_.vjs_getProperty('audioTracks');
  const enabledID = tech.el_.vjs_getProperty('audioTrack');

  audioTracks.forEach((track) => {
    track.label = track.title;
    if (track.id === enabledID) {
      track.enabled = true;
    } else {
      track.enabled = false;
    }
    tech.audioTracks().addTrack(new videojs.AudioTrack(track));
  });
};
