const { expect } = require('chai');
const CalendarSource = require('../lib/calendar_source');
const Event = require('../lib/event');
const { DateTime } = require('@sarosia/datetime');

describe('CalendarSource', () => {
  it('creates a calendar source from object and applies custom filter', () => {
    const source = new CalendarSource(
      {
        name: 'Work',
        url: 'https://work.example.com/cal.ics',
        filter: {
          includeSummaries: ['Standup', 'Release'],
        },
      },
      {
        excludeCancelled: true,
      }
    );

    expect(source.getName()).to.equal('Work');
    expect(source.getUrl()).to.equal('https://work.example.com/cal.ics');
    expect(source.getIdStrategy()).to.equal('uid');

    const ev1 = new Event('1', new DateTime(), new DateTime(), 'Daily Standup');
    const ev2 = new Event('2', new DateTime(), new DateTime(), 'Dentist');
    const ev3 = new Event(
      '3',
      new DateTime(),
      new DateTime(),
      'Release v2',
      '',
      '',
      'CANCELLED'
    );

    const filtered = source.filterEvents([ev1, ev2, ev3]);
    expect(filtered).to.have.lengthOf(1);
    expect(filtered[0].getSummary()).to.equal('Daily Standup');
    expect(filtered[0].getSourceName()).to.equal('Work');
  });

  it('automatically configures time_summary idStrategy for Byga sources or explicit config', () => {
    const bygaSource = new CalendarSource({
      name: 'Timothy - Soccer',
      url: 'http://pasc.byga.net/cal/dyyhKJ4bIG.ics',
    });
    expect(bygaSource.getIdStrategy()).to.equal('time_summary');

    const explicitSource = new CalendarSource({
      name: 'Custom',
      url: 'https://example.com/cal.ics',
      idStrategy: 'time_summary',
    });
    expect(explicitSource.getIdStrategy()).to.equal('time_summary');

    const startTime = new DateTime('2026-09-01T10:00:00.000Z');
    const endTime = new DateTime('2026-09-01T11:00:00.000Z');
    const ev = new Event('unstable-1', startTime, endTime, 'Soccer Practice');
    bygaSource.filterEvents([ev]);
    expect(ev.getIdStrategy()).to.equal('time_summary');
  });
});
