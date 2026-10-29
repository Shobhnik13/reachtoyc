'use strict';

const status = require('app/configs/status');

function wrap(fn) {
  return async function (...args) {
    try {
      return await fn(...args);
    } catch (e) {
      let next = args[2];
      let isExpress = args.length === 3 && typeof next === 'function' && args[1] && typeof args[1].json === 'function';

      if (!isExpress) {
        throw e;
      }

      let envelope = status.getStatus(e.message);

      if (envelope.code === 'generic_fail') {
        console.error(e);
      }

      return next(envelope);
    }
  };
}

module.exports = {wrap};
