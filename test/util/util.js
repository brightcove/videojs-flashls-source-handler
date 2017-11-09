import videojs from 'video.js';

export const noop = () => {};

/* eslint-disable camelcase */
export const makeMochTech = (getters, setters) => {
  const tech = new videojs.EventTarget();
  tech.el_ = {
      vjs_getProperty(prop) {
        const getProp = getters[prop] || noop;

        return getProp();
      },
      vjs_setProperty(prop, value) {
        const setProp = setters[prop] || noop;

        return setProp(value);
      }
    }
  return tech;
};

/* eslint-enable camelcase */

