export const noop = () => {};

/* eslint-disable camelcase */
export const makeMochTech = (getters, setters) => {
  return {
    el_: {
      vjs_getProperty(prop) {
        const getProp = getters[prop] || noop;

        return getProp();
      },
      vjs_setProperty(prop, value) {
        const setProp = setters[prop] || noop;

        return setProp(value);
      }
    }
  };
};

/* eslint-enable camelcase */

