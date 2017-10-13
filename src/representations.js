/**
 * Creates a representation object for the level
 *
 * @param {Function} enabledCallback
 *        Callback to call when the representation's enabled property is updated
 * @param {Object} level
 *        The level to make a representation from
 * @return {Object}
 *         The representation object for this level
 */
export const createRepresentation = (enabledCallback, level) => {
  const representation = {
    id: level.index + '',
    width: level.width,
    height: level.height,
    bandwidth: level.bitrate,
    isEnabled_: true
  };

  representation.enabled = (enable) => {
    if (typeof enable === 'undefined') {
      return representation.isEnabled_;
    }

    if (enable === representation.isEnabled_) {
      return;
    }

    if (enable === true || enable === false) {
      representation.isEnabled_ = enable;
      enabledCallback();
    }
  };

  return representation;
};

/**
 * Creates the list of representations and returns a function to use the api
 *
 * @param {Object} tech
 *        The flash tech
 * @return {Function}
 *         Function used to get the list of representations
 */
export const createRepresentations = (tech) => {
  let representations = null;

  const updateEnabled = () => {
    const enabledRepresentations = representations.filter(rep => rep.enabled());

    // if all representations are enabled or all are disabled, enter auto mode and
    // disable auto capping
    if (enabledRepresentations.length === representations.length ||
        enabledRepresentations.length === 0) {
      tech.el_.vjs_setProperty('autoLevelCapping', -1);
      tech.el_.vjs_setProperty('level', -1);
      return;
    }

    // if only one representation is enabled, enter manual level mode
    if (enabledRepresentations.length === 1) {
      tech.el_.vjs_setProperty('level', parseInt(enabledRepresentations[0].id, 10));
      return;
    }

    // otherwise enter auto mode and set auto level capping to highest bitrate
    // representation
    const autoCap = enabledRepresentations[enabledRepresentations.length - 1].id;

    tech.el_.vjs_setProperty('autoLevelCapping', parseInt(autoCap, 10));
    tech.el_.vjs_setProperty('level', -1);
  };

  return () => {
    // populate representations on the first call
    if (!representations) {
      const levels = tech.el_.vjs_getProperty('levels');

      // filter out levels that are audio only before mapping to representation objects
      representations = levels.filter(level => !level.audio)
                              .map(createRepresentation.bind(null, updateEnabled));
    }

    return representations;
  };
};
