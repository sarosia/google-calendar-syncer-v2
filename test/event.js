const { expect } = require('chai');
const Event = require('../lib/event');
const { DateTime } = require('@sarosia/datetime');

describe('Event', () => {
  const startTime = new DateTime('2026-09-01T10:00:00.000Z');
  const endTime = new DateTime('2026-09-01T11:00:00.000Z');

  it('creates and serializes event correctly', () => {
    const event = new Event(
      'event-123',
      startTime,
      endTime,
      'Team Standup',
      'Daily sync',
      'Meeting Room A',
      'CONFIRMED',
      {},
      'Work Calendar'
    );

    expect(event.getId()).to.equal('event-123');
    expect(event.getIcsUid()).to.equal('event-123');
    expect(event.getName()).to.equal('Team Standup');
    expect(event.getSummary()).to.equal('Team Standup');
    expect(event.getDescription()).to.equal('Daily sync');
    expect(event.getLocation()).to.equal('Meeting Room A');
    expect(event.getStatus()).to.equal('CONFIRMED');
    expect(event.getSourceName()).to.equal('Work Calendar');
    expect(event.toString()).to.include('Team Standup');

    const stableId = event.getStableId();
    expect(stableId).to.be.a('string').with.lengthOf(64);
    expect(/^[a-v0-9]{5,1024}$/.test(stableId)).to.be.true;

    const json = event.toJson();
    expect(json.id).to.equal('event-123');
    expect(json.stableId).to.equal(stableId);
    expect(json.contentHash).to.be.a('string').with.lengthOf(64);
    expect(json.summary).to.equal('Team Standup');
    expect(json.isSynced).to.be.false;
    expect(json.isDeleted).to.be.false;

    event.setSynced(true);
    expect(event.isSynced()).to.be.true;
    expect(event.isDeleted()).to.be.false;
    expect(event.toJson().isSynced).to.be.true;
    expect(event.toJson().isDeleted).to.be.false;

    event.setDeleted(true);
    expect(event.isDeleted()).to.be.true;
    expect(event.isSynced()).to.be.false;
    expect(event.toJson().isDeleted).to.be.true;
    expect(event.toJson().isSynced).to.be.false;

    event.setSynced(true);
    expect(event.isSynced()).to.be.true;
    expect(event.isDeleted()).to.be.false;

    const gcal = event.toGoogleCalendarEvent();
    expect(gcal.id).to.equal(stableId);
    expect(gcal.start.dateTime).to.equal('2026-09-01T10:00:00.000Z');
    expect(gcal.end.dateTime).to.equal('2026-09-01T11:00:00.000Z');
    expect(gcal.extendedProperties.private.syncerSource).to.equal(
      'Work Calendar'
    );
    expect(gcal.extendedProperties.private.icsUid).to.equal('event-123');
    expect(gcal.extendedProperties.private.icsHash).to.equal(
      event.getContentHash()
    );
  });

  it('generates deterministic stable ID for same source and UID', () => {
    const event1 = new Event(
      'uid-abc',
      startTime,
      endTime,
      'Event 1',
      '',
      '',
      'CONFIRMED',
      {},
      'Soccer'
    );
    const event2 = new Event(
      'uid-abc',
      new DateTime('2026-09-02T10:00:00.000Z'),
      new DateTime('2026-09-02T11:00:00.000Z'),
      'Event 1 Modified Time',
      '',
      '',
      'CONFIRMED',
      {},
      'Soccer'
    );

    expect(event1.getStableId()).to.equal(event2.getStableId());
  });

  it('generates stable IDs across random UIDs when idStrategy is time_summary', () => {
    const event1 = new Event(
      'random-uid-111-aaa',
      startTime,
      endTime,
      'Soccer Practice',
      'Wear cleats',
      'Field 1',
      'CONFIRMED',
      {},
      'Timothy - Soccer',
      null,
      'time_summary'
    );
    const event2 = new Event(
      'random-uid-222-bbb',
      startTime,
      endTime,
      'Soccer Practice',
      'Wear shinguards',
      'Field 2',
      'CONFIRMED',
      {},
      'Timothy - Soccer',
      null,
      'time_summary'
    );

    expect(event1.getStableId()).to.equal(event2.getStableId());
    // Content hash reflects the description/location updates
    expect(event1.getContentHash()).to.not.equal(event2.getContentHash());
  });

  it('generates distinct stable IDs for different sources or recurrence IDs', () => {
    const event1 = new Event(
      'uid-abc',
      startTime,
      endTime,
      'Event',
      '',
      '',
      'CONFIRMED',
      {},
      'Soccer'
    );
    const event2 = new Event(
      'uid-abc',
      startTime,
      endTime,
      'Event',
      '',
      '',
      'CONFIRMED',
      {},
      'Volleyball'
    );
    const event3 = new Event(
      'uid-abc',
      startTime,
      endTime,
      'Event',
      '',
      '',
      'CONFIRMED',
      {},
      'Soccer',
      '20260901T100000Z'
    );

    expect(event1.getStableId()).to.not.equal(event2.getStableId());
    expect(event1.getStableId()).to.not.equal(event3.getStableId());
  });

  it('detects content changes with getContentHash', () => {
    const event1 = new Event(
      'uid-abc',
      startTime,
      endTime,
      'Match A',
      'Field 1',
      'Park',
      'CONFIRMED'
    );
    const event2 = new Event(
      'uid-abc',
      startTime,
      endTime,
      'Match A',
      'Field 1',
      'Park',
      'CONFIRMED'
    );
    const event3 = new Event(
      'uid-abc',
      startTime,
      endTime,
      'Match A - Rescheduled Field',
      'Field 2',
      'Park',
      'CONFIRMED'
    );

    expect(event1.getContentHash()).to.equal(event2.getContentHash());
    expect(event1.getContentHash()).to.not.equal(event3.getContentHash());
  });

  it('removes duplicate time information and leading dashes from title', () => {
    const testCases = [
      {
        input: '8am-3pm - US: PSP Field Trip',
        expected: 'US: PSP Field Trip',
      },
      {
        input: '10pm - K-6: September Lunch Preorder Deadline',
        expected: 'K-6: September Lunch Preorder Deadline',
      },
      {
        input: '8:15am - US: 1st day of School',
        expected: 'US: 1st day of School',
      },
      {
        input: '12-4pm - Jamboree',
        expected: 'Jamboree',
      },
      {
        input: '8:15-11:30am - US: Picture Day',
        expected: 'US: Picture Day',
      },
      {
        input: '4pm - Scrim: HS Girls JV Volleyball',
        expected: 'Scrim: HS Girls JV Volleyball',
      },
      {
        input: '11:30am-1pm - Alumni: 2026 Young Alumni BBQ',
        expected: 'Alumni: 2026 Young Alumni BBQ',
      },
      {
        input: '12:15-2:45pm - US: High School Student Orientation',
        expected: 'US: High School Student Orientation',
      },
      {
        input: '6-8pm - Senior Banquet',
        expected: 'Senior Banquet',
      },
      {
        input: '8-12am - US: Juniors Monterey Bay Field Trip',
        expected: 'US: Juniors Monterey Bay Field Trip',
      },
      {
        input: '1:1 Sync',
        expected: '1:1 Sync',
      },
      {
        input: '15/16B White vs Burlingame Soccer Club (W 5-0)',
        expected: '15/16B White vs Burlingame Soccer Club (W 5-0)',
      },
      {
        input: 'Day 1 - US',
        expected: 'Day 1 - US',
      },
    ];

    for (const { input, expected } of testCases) {
      expect(Event.cleanSummary(input)).to.equal(expected);
      const ev = new Event('uid-test', startTime, endTime, input);
      expect(ev.getSummary()).to.equal(expected);
      expect(ev.getName()).to.equal(expected);
      expect(ev.getRawSummary()).to.equal(input);
      expect(ev.toJson().summary).to.equal(expected);
      expect(ev.toJson().rawSummary).to.equal(input);
    }
  });

  it('correctly identifies and formats all-day events', () => {
    const rawAllDay = {
      datetype: 'date',
      start: new Date(2026, 8, 9), // Sep 9, 2026
      end: new Date(2026, 8, 12), // Sep 12, 2026
    };
    const allDayEvent = new Event(
      'allday-1',
      new DateTime('2026-09-09T00:00:00.000Z'),
      new DateTime('2026-09-12T00:00:00.000Z'),
      'School Holiday',
      '',
      '',
      'CONFIRMED',
      rawAllDay
    );

    expect(allDayEvent.isAllDay()).to.be.true;
    expect(allDayEvent.getStartDate()).to.equal('2026-09-09');
    expect(allDayEvent.getEndDate()).to.equal('2026-09-12');

    const json = allDayEvent.toJson();
    expect(json.isAllDay).to.be.true;
    expect(json.startDate).to.equal('2026-09-09');
    expect(json.endDate).to.equal('2026-09-12');

    // Single day all-day event without explicit end date
    const singleDayRaw = {
      start: {
        dateOnly: true,
        getFullYear: () => 2026,
        getMonth: () => 8,
        getDate: () => 9,
      },
    };
    const singleDayEvent = new Event(
      'allday-2',
      new DateTime('2026-09-09T00:00:00.000Z'),
      new DateTime('2026-09-09T00:00:00.000Z'),
      'Single Day Off',
      '',
      '',
      'CONFIRMED',
      singleDayRaw
    );

    expect(singleDayEvent.isAllDay()).to.be.true;
    expect(singleDayEvent.getStartDate()).to.equal('2026-09-09');
    expect(singleDayEvent.getEndDate()).to.equal('2026-09-09');
  });

  it('defaults isAllDay to false for timed events', () => {
    const timedEvent = new Event(
      'timed-1',
      startTime,
      endTime,
      'Regular Meeting'
    );
    expect(timedEvent.isAllDay()).to.be.false;
    expect(timedEvent.getStartDate()).to.be.null;
    expect(timedEvent.getEndDate()).to.be.null;
    expect(timedEvent.toJson().isAllDay).to.be.false;
    expect(timedEvent.toJson().startDate).to.be.null;
    expect(timedEvent.toJson().endDate).to.be.null;
  });
});
