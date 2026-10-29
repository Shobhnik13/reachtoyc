'use strict';

const express = require('express');

const controller = require('app/controllers/profile');

const router = express.Router();

router.param('profile_id', (req, res, next, value) => (/^[0-9]+$/.test(value) ? next() : next('route')));

router.post('/', controller.createProfile);
router.get('/', controller.getProfiles);
router.get('/:profile_id', controller.getProfile);
router.put('/:profile_id', controller.updateProfile);

module.exports = router;
