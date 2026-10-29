'use strict';

const morgan = require('morgan');

const customLogFormat = morgan(':method :url :status :res[content-length] - :response-time ms');

module.exports = {customLogFormat};
