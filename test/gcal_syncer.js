const { expect } = require('chai');
const GCalSyncer = require('../lib/gcal_syncer');
const CalendarSource = require('../lib/calendar_source');
const Event = require('../lib/event');
const { DateTime } = require('@sarosia/datetime');

describe('GCalSyncer', () => {
  const now = DateTime.now();

  it('skips syncing when no targetCalendarId is configured', async () => {
    const source = new CalendarSource({
      name: 'Test Source',
      url: 'https://example.com/cal.ics',
    });
    const syncer = new GCalSyncer();
    const result = await syncer.syncSource(source, []);
    expect(result.skipped).to.be.true;
    expect(result.reason).to.equal('no_target_calendar_id');
  });

  it('correctly adds new events, updates changed events, deletes removed events, and skips unchanged', async () => {
    const event1 = new Event(
      'uid-1',
      now,
      now,
      'Event 1',
      'Desc 1',
      'Loc 1',
      'CONFIRMED',
      {},
      'TestSource'
    );
    const event2 = new Event(
      'uid-2',
      now,
      now,
      'Event 2 Updated',
      'Desc 2',
      'Loc 2',
      'CONFIRMED',
      {},
      'TestSource'
    );

    const stableId1 = event1.getStableId();
    const stableId2 = event2.getStableId();
    const stableIdOrphan = 'orphan-event-id';

    const inserted = [];
    const patched = [];
    const deleted = [];

    const mockCalendar = {
      events: {
        list: async ({ calendarId, privateExtendedProperty }) => {
          expect(calendarId).to.equal('target-cal-123');
          expect(privateExtendedProperty).to.equal('syncerSource=TestSource');
          return {
            data: {
              items: [
                {
                  id: stableId2,
                  summary: 'Event 2 Old',
                  extendedProperties: {
                    private: {
                      syncerSource: 'TestSource',
                      icsHash: 'old-hash-different',
                    },
                  },
                },
                {
                  id: stableIdOrphan,
                  summary: 'Orphaned Event',
                  extendedProperties: {
                    private: {
                      syncerSource: 'TestSource',
                      icsHash: 'hash',
                    },
                  },
                },
              ],
            },
          };
        },
        insert: async ({ calendarId, requestBody }) => {
          inserted.push({ calendarId, requestBody });
          return { data: requestBody };
        },
        patch: async ({ calendarId, eventId, requestBody }) => {
          patched.push({ calendarId, eventId, requestBody });
          return { data: requestBody };
        },
        delete: async ({ calendarId, eventId }) => {
          deleted.push({ calendarId, eventId });
          return { data: {} };
        },
      },
    };

    const source = new CalendarSource({
      name: 'TestSource',
      url: 'https://example.com/cal.ics',
      targetCalendarId: 'target-cal-123',
    });

    const syncer = new GCalSyncer({ calendar: mockCalendar });
    const stats = await syncer.syncSource(source, [event1, event2]);

    expect(stats.added).to.equal(1);
    expect(stats.updated).to.equal(1);
    expect(stats.deleted).to.equal(1);
    expect(stats.unchanged).to.equal(0);
    expect(stats.errors).to.be.empty;

    expect(inserted).to.have.lengthOf(1);
    expect(inserted[0].requestBody.id).to.equal(stableId1);

    expect(patched).to.have.lengthOf(1);
    expect(patched[0].eventId).to.equal(stableId2);

    expect(deleted).to.have.lengthOf(1);
    expect(deleted[0].eventId).to.equal(stableIdOrphan);

    expect(event1.isSynced()).to.be.true;
    expect(event2.isSynced()).to.be.true;
  });

  it('respects tombstone mode by default and skips re-creating deleted events', async () => {
    const event1 = new Event(
      'uid-deleted',
      now,
      now,
      'Deleted Event',
      '',
      '',
      'CONFIRMED',
      {},
      'TestSource'
    );
    const stableId = event1.getStableId();

    const mockCalendar = {
      events: {
        list: async () => ({
          data: {
            items: [
              {
                id: stableId,
                status: 'cancelled',
                summary: 'Deleted Event',
                extendedProperties: {
                  private: {
                    syncerSource: 'TestSource',
                    icsHash: event1.getContentHash(),
                  },
                },
              },
            ],
          },
        }),
        insert: async () => {
          throw new Error('Should not call insert');
        },
        patch: async () => {
          throw new Error('Should not call patch');
        },
        delete: async () => {},
      },
    };

    const source = new CalendarSource({
      name: 'TestSource',
      url: 'https://example.com/cal.ics',
      targetCalendarId: 'target-cal-123',
    });

    const syncer = new GCalSyncer({ calendar: mockCalendar });
    expect(syncer.isTombstoneMode()).to.be.true;

    const stats = await syncer.syncSource(source, [event1]);
    expect(stats.added).to.equal(0);
    expect(stats.updated).to.equal(0);
    expect(stats.tombstoned).to.equal(1);
    expect(event1.isSynced()).to.be.false;
    expect(event1.isDeleted()).to.be.true;
    expect(event1.toJson().isDeleted).to.be.true;
  });
});
