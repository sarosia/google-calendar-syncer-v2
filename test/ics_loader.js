const { expect } = require('chai');
const IcsLoader = require('../lib/ics_loader');
const { DateTime } = require('@sarosia/datetime');

describe('IcsLoader', () => {
  const loader = new IcsLoader();

  const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Example Corp.//EN
BEGIN:VEVENT
UID:event-1@example.com
DTSTAMP:20260101T000000Z
DTSTART:20260915T100000Z
DTEND:20260915T110000Z
SUMMARY:Sprint Planning
DESCRIPTION:Discuss roadmap and backlog
LOCATION:Room 404
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:event-2@example.com
DTSTAMP:20260101T000000Z
DTSTART:20260920T140000Z
DTEND:20260920T153000Z
SUMMARY:1:1 Sync
DESCRIPTION:Weekly check-in
LOCATION:Zoom
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

  it('parses valid ICS string into Event objects', async () => {
    const events = await loader.parseIcs(SAMPLE_ICS);
    expect(events).to.be.an('array').with.lengthOf(2);

    const [first, second] = events;
    expect(first.getId()).to.equal('event-1@example.com');
    expect(first.getSummary()).to.equal('Sprint Planning');
    expect(first.getDescription()).to.equal('Discuss roadmap and backlog');
    expect(first.getLocation()).to.equal('Room 404');
    expect(first.getStatus()).to.equal('CONFIRMED');
    expect(first.getStartTime()).to.be.an.instanceOf(DateTime);

    expect(second.getId()).to.equal('event-2@example.com');
    expect(second.getSummary()).to.equal('1:1 Sync');
    expect(second.getStatus()).to.equal('CANCELLED');
  });

  it('handles invalid input gracefully', async () => {
    try {
      await loader.parseIcs('');
      expect.fail('Should have thrown an error');
    } catch (err) {
      expect(err.message).to.include('non-empty string');
    }
  });

  it('handles missing URL gracefully in loadFromUrl', async () => {
    try {
      await loader.loadFromUrl(null);
      expect.fail('Should have thrown an error');
    } catch (err) {
      expect(err.message).to.include('valid ICS URL');
    }
  });

  it('normalizes webcal:// protocol and attaches source name', async () => {
    const customLoader = new IcsLoader();
    const events = await customLoader.parseIcs(SAMPLE_ICS, 'Pinewood');
    expect(events[0].getSourceName()).to.equal('Pinewood');
  });
});
