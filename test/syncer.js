const { expect } = require('chai');
const CalendarSyncer = require('../lib/syncer');
const Event = require('../lib/event');
const { DateTime } = require('@sarosia/datetime');

describe('CalendarSyncer', () => {
  it('instantiates syncer and manages multiple sources with per-source filters', async () => {
    const mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const syncer = new CalendarSyncer(
      {
        calendars: [
          {
            name: 'Personal',
            url: 'https://example.com/personal.ics',
            filter: {
              includeSummaries: ['Family'],
            },
          },
          {
            name: 'Work',
            url: 'https://example.com/work.ics',
            filter: {
              excludeSummaries: ['Private'],
            },
          },
        ],
      },
      mockLogger
    );

    expect(syncer.getSources()).to.have.lengthOf(2);
    expect(syncer.getEvents()).to.be.an('array').that.is.empty;
  });

  it('filters loaded events per-source in fetchAndFilter with custom loader stub', async () => {
    const mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const syncer = new CalendarSyncer(
      {
        calendars: [
          {
            name: 'School',
            url: 'https://school.example.com/cal.ics',
            filter: {
              includeSummaries: ['Math', 'Physics'],
            },
          },
          {
            name: 'Gym',
            url: 'https://gym.example.com/cal.ics',
            filter: {
              includeSummaries: ['Workout'],
            },
          },
        ],
      },
      mockLogger
    );

    syncer.getLoader().loadFromUrl = async (url, options) => {
      if (url.includes('school')) {
        return [
          new Event(
            '1',
            new DateTime('2026-09-01T10:00:00Z'),
            new DateTime('2026-09-01T11:00:00Z'),
            'Math Class',
            '',
            '',
            'CONFIRMED',
            {},
            options.sourceName
          ),
          new Event(
            '2',
            new DateTime('2026-09-01T11:00:00Z'),
            new DateTime('2026-09-01T12:00:00Z'),
            'History Class',
            '',
            '',
            'CONFIRMED',
            {},
            options.sourceName
          ),
        ];
      }
      return [
        new Event(
          '3',
          new DateTime('2026-09-01T14:00:00Z'),
          new DateTime('2026-09-01T15:00:00Z'),
          'Workout Session',
          '',
          '',
          'CONFIRMED',
          {},
          options.sourceName
        ),
        new Event(
          '4',
          new DateTime('2026-09-01T16:00:00Z'),
          new DateTime('2026-09-01T17:00:00Z'),
          'Social Hour',
          '',
          '',
          'CONFIRMED',
          {},
          options.sourceName
        ),
      ];
    };

    const events = await syncer.fetchAndFilter();
    expect(events).to.have.lengthOf(2);
    expect(events.map((e) => e.getSummary())).to.deep.equal([
      'Math Class',
      'Workout Session',
    ]);
    expect(events[0].getSourceName()).to.equal('School');
    expect(events[1].getSourceName()).to.equal('Gym');
  });
});
