const path = require('path');
const Apper = require('@sarosia/apper');
const CalendarSyncer = require('./syncer');
const CalendarStore = require('./calendar_store');

let syncer;
let calendarStore;
let initPromise = null;

function ensureInit(config = {}, logger = console) {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        if (!calendarStore) {
          calendarStore = new CalendarStore({
            storagePath:
              config.dbPath || config.storagePath || config.notabledbPath,
            url: config.notabledbUrl,
            defaultFilter: config.defaultFilter,
          });
        }
        await calendarStore.init(config.calendars);
        if (syncer) {
          syncer.setCalendarStore(calendarStore);
          await syncer.reloadSourcesFromStore();
        }
      } catch (err) {
        if (logger) {
          logger.error(
            'Failed to initialize calendar store with notabledb:',
            err
          );
        }
      }
    })();
  }
  return initPromise;
}

const app = new Apper(
  'calendersyncer',
  (ctx) => {
    const logger = ctx.logger;
    const config = ctx.config;
    calendarStore = new CalendarStore({
      storagePath: config.dbPath || config.storagePath || config.notabledbPath,
      url: config.notabledbUrl,
      defaultFilter: config.defaultFilter,
    });
    syncer = new CalendarSyncer(config, logger, null, calendarStore);
    ensureInit(config, logger).then(() => {
      syncer.startPolling();
    });
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

app.get('/sources', async (context, req, res) => {
  await ensureInit(context.config, context.logger);
  res.send(
    syncer
      ? syncer.getSources().map((s) => ({
          id: s.getId(),
          name: s.getName(),
          url: s.getUrl(),
          eventsCount: s.getEvents().length,
          targetCalendarId: s.getTargetCalendarId(),
          idStrategy: s.getIdStrategy(),
          filter: s.getFilterConfig(),
        }))
      : []
  );
});

// Calendar management backed by notabledb
app.get('/calendars', async (context, req, res) => {
  await ensureInit(context.config, context.logger);
  try {
    const calendars = await calendarStore.listCalendars();
    const sources = syncer ? syncer.getSources() : [];
    const sourceMap = new Map(sources.map((s) => [s.getName(), s]));

    const result = calendars.map((cal) => {
      const live = sourceMap.get(cal.name);
      return {
        ...cal,
        eventsCount: live ? live.getEvents().length : 0,
      };
    });
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.get('/calendars/:id', async (context, req, res) => {
  await ensureInit(context.config, context.logger);
  try {
    const cal = await calendarStore.getCalendar(req.params.id);
    if (!cal) {
      return res
        .status(404)
        .send({ error: `Calendar "${req.params.id}" not found.` });
    }
    const sources = syncer ? syncer.getSources() : [];
    const live = sources.find((s) => s.getName() === cal.name);
    res.send({
      ...cal,
      eventsCount: live ? live.getEvents().length : 0,
    });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.post('/calendars', async (context, req, res) => {
  await ensureInit(context.config, context.logger);
  try {
    const body = req.body || {};
    const { name, url, targetCalendarId, idStrategy, filter } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).send({ error: 'Calendar name is required.' });
    }
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).send({ error: 'Calendar feed URL is required.' });
    }

    const created = await calendarStore.addCalendar({
      name,
      url,
      targetCalendarId,
      idStrategy,
      filter,
    });

    if (syncer) {
      await syncer.reloadSourcesFromStore();
      syncer.fetchAndFilter().catch((e) => {
        context.logger.error('Background sync failed after calendar add:', e);
      });
    }

    res.status(201).send({
      status: 'OK',
      calendar: created,
    });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.put('/calendars/:id', async (context, req, res) => {
  await ensureInit(context.config, context.logger);
  try {
    const id = req.params.id;
    const body = req.body || {};
    const { name, url, targetCalendarId, idStrategy, filter } = body;

    const updated = await calendarStore.updateCalendar(id, {
      name,
      url,
      targetCalendarId,
      idStrategy,
      filter,
    });

    if (syncer) {
      await syncer.reloadSourcesFromStore();
      syncer.fetchAndFilter().catch((e) => {
        context.logger.error(
          'Background sync failed after calendar update:',
          e
        );
      });
    }

    res.send({
      status: 'OK',
      calendar: updated,
    });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).send({ error: err.message });
  }
});

app.delete('/calendars/:id', async (context, req, res) => {
  await ensureInit(context.config, context.logger);
  try {
    const id = req.params.id;
    const removed = await calendarStore.removeCalendar(id);

    if (syncer) {
      await syncer.reloadSourcesFromStore();
      syncer.fetchAndFilter().catch((e) => {
        context.logger.error(
          'Background sync failed after calendar delete:',
          e
        );
      });
    }

    res.send({
      status: 'OK',
      removed,
    });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).send({ error: err.message });
  }
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
