const path = require('path');
const Apper = require('@sarosia/apper');
const CalendarSyncer = require('./syncer');

let syncer;

const app = new Apper(
  'calendersyncer',
  (ctx) => {
    const logger = ctx.logger;
    const config = ctx.config;
    syncer = new CalendarSyncer(config, logger);
    syncer.startPolling();
  },
  {
    port: 3001,
    appName: 'Google Calendar Syncer',
    syncFrequency: '15m',
    staticPaths: [
      path.resolve(`${__dirname}/../static`),
      path.resolve(`${__dirname}/../node_modules/@sarosia/e/src`),
    ],
    defaultFilter: {
      excludeCancelled: true,
      futureWindow: '90d',
      pastWindow: '7d',
    },
    calendars: [],
    auth: {
      enabled: true,
      cookieName: 'gcs_session',
      allowedEmails: [],
    },
  }
);

// Syncer-specific API routes (automatically protected by Apper auth)
app.get('/events', (context, req, res) => {
  res.send(syncer ? syncer.getEvents().map((e) => e.toJson()) : []);
});

app.get('/sync', async (context, req, res) => {
  if (!syncer) {
    return res.status(500).send({ error: 'Syncer not initialized' });
  }
  try {
    const events = await syncer.fetchAndFilter();
    res.send({
      status: 'OK',
      eventsCount: events.length,
      events: events.map((e) => e.toJson()),
    });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get('/sources', (context, req, res) => {
  res.send(
    syncer
      ? syncer.getSources().map((s) => ({
          name: s.getName(),
          url: s.getUrl(),
          eventsCount: s.getEvents().length,
          targetCalendarId: s.getTargetCalendarId(),
        }))
      : []
  );
});

app.get('/status', (context, req, res) => {
  res.send({
    status: 'OK',
    app: 'calendersyncer',
    sourcesCount: syncer ? syncer.getSources().length : 0,
    eventsCount: syncer ? syncer.getEvents().length : 0,
  });
});

module.exports = function () {
  app.start();
};
