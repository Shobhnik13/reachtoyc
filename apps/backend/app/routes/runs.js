'use strict';

const express = require('express');

const controller = require('app/controllers/run');

const router = express.Router();

router.param('run_id', (req, res, next, value) => (/^[0-9]+$/.test(value) ? next() : next('route')));

router.post('/', controller.createRun);
router.get('/', controller.getRuns);
router.get('/:run_id', controller.getRun);
router.put('/:run_id', controller.updateRun);

module.exports = router;
