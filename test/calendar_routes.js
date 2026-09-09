const { expect } = require('chai');
const express = require('express');
const http = require('http');
const axios = require('axios');
const { Database, InMemoryStorage } = require('@sarosia/notabledb');
const CalendarStore = require('../lib/calendar_store');
const CalendarSyncer = require('../lib/syncer');

describe('Calendar API Routes with notabledb', () => {
  let app;
  let server;
  let baseUrl;
  let store;
  let syncer;

  before((done) => {
    app = express();
    app.use(express.json());

    const storage = new InMemoryStorage();
    const database = new Database(storage);
    store = new CalendarStore({
      database,
      defaultFilter: {
        excludeCancelled: true,
        futureWindow: '90d',
        pastWindow: '7d',
      },
    });

    syncer = new CalendarSyncer({}, console, null, store);

    // Routes
    app.get('/calendars', async (req, res) => {
      try {
        const calendars = await store.listCalendars();
        res.json(calendars);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/calendars/:id', async (req, res) => {
      try {
        const cal = await store.getCalendar(req.params.id);
        if (!cal) {
          return res.status(404).json({ error: 'Not found' });
        }
        res.json(cal);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/calendars', async (req, res) => {
      try {
        const { name, url, targetCalendarId, idStrategy, filter } = req.body;
        if (!name || !name.trim()) {
          return res.status(400).json({ error: 'Calendar name is required.' });
        }
        if (!url || !url.trim()) {
          return res.status(400).json({ error: 'Calendar URL is required.' });
        }
        const created = await store.addCalendar({
          name,
          url,
          targetCalendarId,
          idStrategy,
          filter,
        });
        await syncer.reloadSourcesFromStore();
        res.status(201).json({ status: 'OK', calendar: created });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.put('/calendars/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updated = await store.updateCalendar(id, req.body);
        await syncer.reloadSourcesFromStore();
        res.json({ status: 'OK', calendar: updated });
      } catch (err) {
        const status = err.message.includes('not found') ? 404 : 500;
        res.status(status).json({ error: err.message });
      }
    });

    app.delete('/calendars/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const removed = await store.removeCalendar(id);
        await syncer.reloadSourcesFromStore();
        res.json({ status: 'OK', removed });
      } catch (err) {
        const status = err.message.includes('not found') ? 404 : 500;
        res.status(status).json({ error: err.message });
      }
    });

    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      done();
    });
  });

  after((done) => {
    server.close(done);
  });

  it('starts with empty list of calendars', async () => {
    const res = await axios.get(`${baseUrl}/calendars`);
    expect(res.status).to.equal(200);
    expect(res.data).to.deep.equal([]);
  });

  it('adds a calendar and updates syncer sources', async () => {
    const res = await axios.post(`${baseUrl}/calendars`, {
      name: 'Soccer Team',
      url: 'https://example.com/soccer.ics',
      targetCalendarId: 'soccer@group.calendar.google.com',
      idStrategy: 'time_summary',
      filter: {
        excludeSummaries: ['Cancelled', 'Optional'],
      },
    });

    expect(res.status).to.equal(201);
    expect(res.data.status).to.equal('OK');
    expect(res.data.calendar.name).to.equal('Soccer Team');
    expect(res.data.calendar.id).to.be.a('string');

    // Verify syncer reloaded source
    const sources = syncer.getSources();
    expect(sources).to.have.lengthOf(1);
    expect(sources[0].getName()).to.equal('Soccer Team');
    expect(sources[0].getIdStrategy()).to.equal('time_summary');
  });

  it('updates calendar filter and settings', async () => {
    const listRes = await axios.get(`${baseUrl}/calendars`);
    const calId = listRes.data[0].id;

    const putRes = await axios.put(`${baseUrl}/calendars/${calId}`, {
      name: 'Soccer Varsity',
      filter: {
        excludeSummaries: ['Cancelled'],
        futureWindow: '180d',
      },
    });

    expect(putRes.status).to.equal(200);
    expect(putRes.data.calendar.name).to.equal('Soccer Varsity');
    expect(putRes.data.calendar.filter.futureWindow).to.equal('180d');

    // Verify retrieval by id
    const getRes = await axios.get(`${baseUrl}/calendars/${calId}`);
    expect(getRes.data.name).to.equal('Soccer Varsity');
    expect(getRes.data.filter.futureWindow).to.equal('180d');
  });

  it('deletes a calendar and removes it from syncer sources', async () => {
    const listRes = await axios.get(`${baseUrl}/calendars`);
    const calId = listRes.data[0].id;

    const delRes = await axios.delete(`${baseUrl}/calendars/${calId}`);
    expect(delRes.status).to.equal(200);
    expect(delRes.data.removed.id).to.equal(calId);

    const afterList = await axios.get(`${baseUrl}/calendars`);
    expect(afterList.data).to.have.lengthOf(0);

    const sources = syncer.getSources();
    expect(sources).to.have.lengthOf(0);
  });
});
