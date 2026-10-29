'use strict';

const express = require('express');

const controller = require('app/controllers/batch');

const router = express.Router();

router.get('/', controller.getBatches);

module.exports = router;
