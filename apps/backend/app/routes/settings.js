'use strict';

const express = require('express');

const controller = require('app/controllers/setting');

const router = express.Router();

router.get('/', controller.getSettings);

module.exports = router;
