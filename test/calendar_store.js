const { expect } = require('chai');
const { Database, InMemoryStorage } = require('@sarosia/notabledb');
const CalendarStore = require('../lib/calendar_store');

describe('CalendarStore with notabledb', () => {
  let storage;
  let database;
  let store;

  beforeEach(() => {
    storage = new InMemoryStorage();
    database = new Database(storage);
    store = new CalendarStore({
      database,
      defaultFilter: {
        excludeCancelled: true,
        futureWindow: '90d',
        pastWindow: '7d',
      },
    });
  });

  it('initializes empty and seeds initial calendars if provided', async () => {
    expect(await store.listCalendars()).to.deep.equal([]);

    const initial = [
      {
        name: 'School',
        url: 'https://school.example.com/cal.ics',
        targetCalendarId: 'school-gcal',
        filter: {
          excludeCancelled: false,
        },
      },
    ];

    await store.init(initial);
    const calendars = await store.listCalendars();
    expect(calendars.length).to.equal(1);
    expect(calendars[0].name).to.equal('School');
    expect(calendars[0].url).to.equal('https://school.example.com/cal.ics');
    expect(calendars[0].targetCalendarId).to.equal('school-gcal');
    expect(calendars[0].filter.excludeCancelled).to.be.false;
    expect(calendars[0].id).to.be.a('string');

    // Subsequent init does not overwrite existing data
    await store.init([{ name: 'Other', url: 'https://other.com/cal.ics' }]);
    const afterReinit = await store.listCalendars();
    expect(afterReinit.length).to.equal(1);
    expect(afterReinit[0].name).to.equal('School');
  });

  it('adds a new calendar subscription with default filter fallback', async () => {
    const cal = await store.addCalendar({
      name: 'Soccer League',
      url: 'webcal://soccer.example.com/feed.ics',
      targetCalendarId: 'soccer-target',
      idStrategy: 'time_summary',
    });

    expect(cal.id).to.be.a('string');
    expect(cal.name).to.equal('Soccer League');
    expect(cal.idStrategy).to.equal('time_summary');
    expect(cal.filter.excludeCancelled).to.be.true;
    expect(cal.filter.futureWindow).to.equal('90d');

    const fetched = await store.getCalendar(cal.id);
    expect(fetched.name).to.equal('Soccer League');
  });

  it('rejects adding calendar without name or url', async () => {
    try {
      await store.addCalendar({ url: 'https://example.com' });
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e.message).to.include('name is required');
    }

    try {
      await store.addCalendar({ name: 'Test' });
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e.message).to.include('URL is required');
    }
  });

  it('updates calendar details and modifies filters', async () => {
    const cal = await store.addCalendar({
      name: 'Old Name',
      url: 'https://old.com/cal.ics',
      filter: {
        excludeSummaries: ['practice'],
      },
    });

    const updated = await store.updateCalendar(cal.id, {
      name: 'New Name',
      filter: {
        excludeSummaries: ['practice', 'cancelled'],
        futureWindow: '180d',
      },
    });

    expect(updated.name).to.equal('New Name');
    expect(updated.url).to.equal('https://old.com/cal.ics');
    expect(updated.filter.excludeSummaries).to.deep.equal([
      'practice',
      'cancelled',
    ]);
    expect(updated.filter.futureWindow).to.equal('180d');

    const retrieved = await store.getCalendar(cal.id);
    expect(retrieved.name).to.equal('New Name');
    expect(retrieved.filter.excludeSummaries).to.include('cancelled');
  });

  it('removes a calendar subscription', async () => {
    const cal = await store.addCalendar({
      name: 'Temp Calendar',
      url: 'https://temp.com/cal.ics',
    });

    expect(await store.listCalendars()).to.have.lengthOf(1);

    const removed = await store.removeCalendar(cal.id);
    expect(removed.name).to.equal('Temp Calendar');
    expect(await store.listCalendars()).to.have.lengthOf(0);
    expect(await store.getCalendar(cal.id)).to.be.null;
  });
});
