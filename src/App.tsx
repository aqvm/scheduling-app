import { NavLink, Route, Routes } from 'react-router-dom';
import { useMemo, useState } from 'react';

type Person = {
  id: string;
  name: string;
  role: 'Host' | 'Speaker';
  availableSlots: string[];
};

type Session = {
  id: string;
  title: string;
  slot: string;
  hostId: string;
  speakerId: string;
  campaign: string;
  status: 'Draft' | 'Confirmed';
};

const campaigns = ['Q1 Product Launch', 'Education Webinar Series', 'Community Outreach'];

const peopleSeed: Person[] = [
  {
    id: 'p1',
    name: 'Alex Rivera',
    role: 'Host',
    availableSlots: ['Mon 10:00', 'Tue 14:00', 'Thu 09:00']
  },
  {
    id: 'p2',
    name: 'Priya Shah',
    role: 'Host',
    availableSlots: ['Mon 10:00', 'Wed 11:00', 'Fri 15:00']
  },
  {
    id: 'p3',
    name: 'Jordan Kim',
    role: 'Speaker',
    availableSlots: ['Tue 14:00', 'Wed 11:00', 'Thu 09:00']
  },
  {
    id: 'p4',
    name: 'Sam Carter',
    role: 'Speaker',
    availableSlots: ['Mon 10:00', 'Thu 09:00', 'Fri 15:00']
  }
];

const sessionsSeed: Session[] = [
  {
    id: 's1',
    title: 'Launch Messaging Review',
    slot: 'Mon 10:00',
    hostId: 'p1',
    speakerId: 'p4',
    campaign: 'Q1 Product Launch',
    status: 'Confirmed'
  },
  {
    id: 's2',
    title: 'Webinar Prep',
    slot: 'Wed 11:00',
    hostId: 'p2',
    speakerId: 'p3',
    campaign: 'Education Webinar Series',
    status: 'Draft'
  }
];

function HomePage({
  selectedCampaign,
  sessions,
  people
}: {
  selectedCampaign: string;
  sessions: Session[];
  people: Person[];
}) {
  const campaignSessions = sessions.filter((session) => session.campaign === selectedCampaign);
  const confirmedCount = campaignSessions.filter((session) => session.status === 'Confirmed').length;
  const uniquePeople = new Set(
    campaignSessions.flatMap((session) => [session.hostId, session.speakerId])
  ).size;

  return (
    <section className="page-card">
      <h2>POC Dashboard</h2>
      <p>
        This proof of concept tracks campaign scheduling, role-based availability, and conflict checks
        before final confirmation.
      </p>
      <div className="kpi-grid">
        <article>
          <h3>{campaignSessions.length}</h3>
          <p>Scheduled Sessions</p>
        </article>
        <article>
          <h3>{confirmedCount}</h3>
          <p>Confirmed Sessions</p>
        </article>
        <article>
          <h3>{uniquePeople}</h3>
          <p>People Assigned</p>
        </article>
        <article>
          <h3>{people.length}</h3>
          <p>Total Team Members</p>
        </article>
      </div>
    </section>
  );
}

function CampaignsPage({ selectedCampaign, sessions }: { selectedCampaign: string; sessions: Session[] }) {
  const campaignSessions = sessions.filter((session) => session.campaign === selectedCampaign);

  return (
    <section className="page-card">
      <h2>{selectedCampaign}</h2>
      <p>Current session pipeline for this campaign.</p>
      <ul className="list-reset">
        {campaignSessions.map((session) => (
          <li key={session.id} className="session-row">
            <strong>{session.title}</strong>
            <span>{session.slot}</span>
            <span className={`status-pill status-${session.status.toLowerCase()}`}>{session.status}</span>
          </li>
        ))}
        {campaignSessions.length === 0 ? <li>No sessions yet.</li> : null}
      </ul>
    </section>
  );
}

function AvailabilityPage({
  people,
  slots
}: {
  people: Person[];
  slots: string[];
}) {
  return (
    <section className="page-card">
      <h2>Availability Matrix</h2>
      <p>Simple view of who can attend each potential slot.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team Member</th>
              <th>Role</th>
              {slots.map((slot) => (
                <th key={slot}>{slot}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <td>{person.name}</td>
                <td>{person.role}</td>
                {slots.map((slot) => (
                  <td key={`${person.id}-${slot}`}>
                    {person.availableSlots.includes(slot) ? <span className="check">Yes</span> : 'No'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProposedSessionsPage({
  selectedCampaign,
  people,
  sessions,
  addSession
}: {
  selectedCampaign: string;
  people: Person[];
  sessions: Session[];
  addSession: (session: Omit<Session, 'id' | 'status'>) => void;
}) {
  const hosts = people.filter((person) => person.role === 'Host');
  const speakers = people.filter((person) => person.role === 'Speaker');
  const slots = useMemo(() => Array.from(new Set(people.flatMap((person) => person.availableSlots))), [people]);

  const [title, setTitle] = useState('');
  const [slot, setSlot] = useState(slots[0] ?? '');
  const [hostId, setHostId] = useState(hosts[0]?.id ?? '');
  const [speakerId, setSpeakerId] = useState(speakers[0]?.id ?? '');

  const conflicts = useMemo(() => {
    if (!slot || !hostId || !speakerId) {
      return [];
    }

    const items: string[] = [];
    const host = people.find((person) => person.id === hostId);
    const speaker = people.find((person) => person.id === speakerId);
    const sameSlotSessions = sessions.filter((session) => session.slot === slot);

    if (host && !host.availableSlots.includes(slot)) {
      items.push(`${host.name} is not available at ${slot}.`);
    }

    if (speaker && !speaker.availableSlots.includes(slot)) {
      items.push(`${speaker.name} is not available at ${slot}.`);
    }

    if (sameSlotSessions.some((session) => session.hostId === hostId || session.speakerId === hostId)) {
      items.push('Selected host already has a session at this time.');
    }

    if (
      sameSlotSessions.some(
        (session) => session.hostId === speakerId || session.speakerId === speakerId
      )
    ) {
      items.push('Selected speaker already has a session at this time.');
    }

    return items;
  }, [slot, hostId, speakerId, people, sessions]);

  const canSubmit = title.trim().length > 2 && conflicts.length === 0;

  return (
    <section className="page-card">
      <h2>Propose Session</h2>
      <p>Create a draft session with immediate conflict checks.</p>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) {
            return;
          }

          addSession({
            title: title.trim(),
            slot,
            hostId,
            speakerId,
            campaign: selectedCampaign
          });

          setTitle('');
        }}
      >
        <label>
          Session title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Example: Customer Success Story"
          />
        </label>
        <label>
          Timeslot
          <select value={slot} onChange={(event) => setSlot(event.target.value)}>
            {slots.map((slotOption) => (
              <option key={slotOption} value={slotOption}>
                {slotOption}
              </option>
            ))}
          </select>
        </label>
        <label>
          Host
          <select value={hostId} onChange={(event) => setHostId(event.target.value)}>
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Speaker
          <select value={speakerId} onChange={(event) => setSpeakerId(event.target.value)}>
            {speakers.map((speaker) => (
              <option key={speaker.id} value={speaker.id}>
                {speaker.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={!canSubmit}>
          Add Draft Session
        </button>
      </form>

      {conflicts.length > 0 ? (
        <ul className="conflict-list">
          {conflicts.map((conflict) => (
            <li key={conflict}>{conflict}</li>
          ))}
        </ul>
      ) : (
        <p className="ok-state">No conflicts detected for this setup.</p>
      )}
    </section>
  );
}

export default function App() {
  const [selectedCampaign, setSelectedCampaign] = useState(campaigns[0]);
  const [sessions, setSessions] = useState<Session[]>(sessionsSeed);
  const allSlots = useMemo(
    () => Array.from(new Set(peopleSeed.flatMap((person) => person.availableSlots))),
    []
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Scheduling App</h1>
        <label className="campaign-switcher" htmlFor="campaign-select">
          Campaign
          <select
            id="campaign-select"
            value={selectedCampaign}
            onChange={(event) => setSelectedCampaign(event.target.value)}
          >
            {campaigns.map((campaign) => (
              <option key={campaign} value={campaign}>
                {campaign}
              </option>
            ))}
          </select>
        </label>
      </header>

      <nav className="top-nav" aria-label="Primary">
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/campaigns">Campaigns</NavLink>
        <NavLink to="/availability">Availability</NavLink>
        <NavLink to="/proposed-sessions">Proposed Sessions</NavLink>
      </nav>

      <main>
        <Routes>
          <Route
            path="/"
            element={
              <HomePage selectedCampaign={selectedCampaign} sessions={sessions} people={peopleSeed} />
            }
          />
          <Route
            path="/campaigns"
            element={<CampaignsPage selectedCampaign={selectedCampaign} sessions={sessions} />}
          />
          <Route
            path="/availability"
            element={<AvailabilityPage people={peopleSeed} slots={allSlots} />}
          />
          <Route
            path="/proposed-sessions"
            element={
              <ProposedSessionsPage
                selectedCampaign={selectedCampaign}
                people={peopleSeed}
                sessions={sessions}
                addSession={(session) =>
                  setSessions((current) => [
                    ...current,
                    { ...session, id: `s${current.length + 1}`, status: 'Draft' }
                  ])
                }
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}
