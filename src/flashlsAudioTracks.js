import videojs from 'video.js';

/**
 * Updates the selected index of the audio track list with the new active track
 *
 * @param {Object} tech
 *        The flash tech
 * @function updateAudioTrack
 */
export const updateAudioTrack = (tech) => {
  const audioTracks = tech.audioTracks();

  for (let i = 0; i < audioTracks.length; i++) {
    if (audioTracks[i].enabled) {
      tech.el_.vjs_setProperty('audioTrack', audioTracks[i].id);
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
  const audioTracks = tech.el_.vjs_getProperty('audioTracks');
  const enabledID = tech.el_.vjs_getProperty('audioTrack');

  audioTracks.forEach((track) => {
    track.label = track.title;
    track.enabled = track.id === enabledID;
    track.id = track.id + '';
    tech.audioTracks().addTrack(new videojs.AudioTrack(track));
  });
};
