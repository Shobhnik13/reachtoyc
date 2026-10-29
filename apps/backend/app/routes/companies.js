'use strict';

const express = require('express');

const controller = require('app/controllers/company');

const router = express.Router();

router.get('/', controller.getCompanies);

module.exports = router;
