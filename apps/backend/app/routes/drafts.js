'use strict';

const express = require('express');

const controller = require('app/controllers/draft');

const router = express.Router();

router.param('draft_id', (req, res, next, value) => (/^[0-9]+$/.test(value) ? next() : next('route')));

router.get('/', controller.getDrafts);
router.get('/:draft_id', controller.getDraft);
router.put('/:draft_id', controller.updateDraft);

module.exports = router;
