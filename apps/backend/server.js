'use strict';

const fs = require('fs');
const path = require('path');

const appLink = path.join(__dirname, 'node_modules', 'app');

try {
  fs.lstatSync(appLink);
} catch {
  fs.mkdirSync(path.dirname(appLink), {recursive: true});
  fs.symlinkSync(path.join('..', 'app'), appLink, 'dir');
}

const cors = require('cors');
const express = require('express');

const pipelineService = require('app/services/pipeline');

const config = require('app/configs/config');
const database = require('app/configs/database');
const loggerConfig = require('app/configs/logger');
const status = require('app/configs/status');

function createApp() {
  const app = express();

  app.use('/healthchecks', require('app/routes/healthchecks'));

  app.use(express.json({limit: '2mb'}));
  `${config.ENV}` !== 'test' ? app.use(loggerConfig.customLogFormat) : null;
  app.use(cors({origin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/}));

  // Routes
  app.use('/batches', require('app/routes/batches'));
  app.use('/companies', require('app/routes/companies'));
  app.use('/drafts', require('app/routes/drafts'));
  app.use('/profiles', require('app/routes/profiles'));
  app.use('/runs', require('app/routes/runs'));
  app.use('/settings', require('app/routes/settings'));

  app.use((req, res) => res.status(404).json(status.getStatus('url_missing')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let envelope = err && err.hasOwnProperty('error') ? err : status.getStatus(err && err.type === 'entity.parse.failed' ? 'input_invalid' : 'generic_fail');
    envelope.code === 'generic_fail' && !err.hasOwnProperty('error') ? console.error(err) : null;
    return res.status(status.getHttpStatus(envelope.code)).json(envelope);
  });

  return app;
}

async function start(port = config.SERVER.PORT) {
  await database.init();

  let server = await new Promise((resolve) => {
    let s = createApp().listen(port, config.SERVER.HOST, () => resolve(s));
  });

  if (config.PIPELINE.AUTOSTART) {
    let interrupted = await pipelineService.interruptActiveRuns();
    interrupted ? console.log(`Marked ${interrupted} unfinished run(s)/draft(s) as interrupted; resume them from the UI`) : null;
  }

  return server;
}

if (require.main === module) {
  start()
    .then((server) => console.log(`Backend on http://${config.SERVER.HOST}:${server.address().port}`))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}

module.exports = {createApp, start};
