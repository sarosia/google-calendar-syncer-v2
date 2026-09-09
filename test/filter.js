const { expect } = require('chai');
const Event = require('../lib/event');
const EventFilter = require('../lib/filter');
const { DateTime, Duration } = require('@sarosia/datetime');
const { Hours } = Duration;

describe('EventFilter', () => {
  const baseTime = new DateTime('2026-09-01T12:00:00.000Z');

  const eventConfirmed = new Event(
    '1',
    baseTime.add(new Hours(48)),
    baseTime.add(new Hours(49)),
    'Engineering Team Meeting',
    'Review PRs and architecture',
    'Office'
  );

  const eventCancelled = new Event(
    '2',
    baseTime.add(new Hours(72)),
    baseTime.add(new Hours(73)),
    'Dentist Appointment',
    'Routine checkup',
    'Clinic',
    'CANCELLED'
  );

  const eventPast = new Event(
    '3',
    baseTime.sub(new Hours(240)),
    baseTime.sub(new Hours(239)),
    'Past Retrospective',
    'Old sprint notes'
  );

  const eventFarFuture = new Event(
    '4',
    baseTime.add(new Hours(2880)),
    baseTime.add(new Hours(2881)),
    'Annual Company Offsite',
    'Future planning'
  );

  it('excludes cancelled events by default', () => {
    const filter = new EventFilter();
    expect(filter.matches(eventConfirmed, baseTime)).to.be.true;
    expect(filter.matches(eventCancelled, baseTime)).to.be.false;
  });

  it('allows cancelled events when excludeCancelled is false', () => {
    const filter = new EventFilter({ excludeCancelled: false });
    expect(filter.matches(eventCancelled, baseTime)).to.be.true;
  });

  it('filters by pastWindow and futureWindow string formats', () => {
    const filter = new EventFilter({
      pastWindow: '7d',
      futureWindow: '90d',
    });

    expect(filter.matches(eventConfirmed, baseTime)).to.be.true;
    expect(filter.matches(eventPast, baseTime)).to.be.false;
    expect(filter.matches(eventFarFuture, baseTime)).to.be.false;
  });

  it('filters by includeSummaries and excludeSummaries', () => {
    const filter = new EventFilter({
      includeSummaries: ['Engineering'],
      excludeSummaries: ['Meeting'],
    });

    expect(filter.matches(eventConfirmed, baseTime)).to.be.false;

    const filterIncludeOnly = new EventFilter({
      includeSummaries: ['Engineering'],
    });
    expect(filterIncludeOnly.matches(eventConfirmed, baseTime)).to.be.true;

    const filterRegex = new EventFilter({
      includeSummaries: [/engineering/i],
    });
    expect(filterRegex.matches(eventConfirmed, baseTime)).to.be.true;
  });

  it('filters by regex string patterns and word boundaries', () => {
    const filter = new EventFilter({
      excludeSummaries: ['/\\b(LS|JH|Junior High)\\b/i'],
    });

    const ev1 = new Event(
      '1',
      baseTime,
      baseTime,
      'LS: Kindergarten Orientation'
    );
    const ev2 = new Event(
      '2',
      baseTime,
      baseTime,
      'Junior High Student Orientation'
    );
    const ev3 = new Event('3', baseTime, baseTime, 'US: JH Yearbook');
    const ev4 = new Event('4', baseTime, baseTime, 'HS Girls JV Volleyball');

    expect(filter.matches(ev1, baseTime)).to.be.false;
    expect(filter.matches(ev2, baseTime)).to.be.false;
    expect(filter.matches(ev3, baseTime)).to.be.false;
    expect(filter.matches(ev4, baseTime)).to.be.true; // "Girls" is preserved
  });
});
