'use strict';

const express = require('express');

const status = require('app/configs/status');

const router = express.Router();

router.get('/', (req, res) => res.json(status.getStatus('success')));

module.exports = router;
