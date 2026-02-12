import { NavLink, Route, Routes } from 'react-router-dom';

type PageProps = {
  title: string;
  description: string;
};

function Page({ title, description }: PageProps) {
  return (
    <section className="page-card">
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

const campaigns = ['Q1 Product Launch', 'Education Webinar Series', 'Community Outreach'];

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Scheduling App</h1>
        <label className="campaign-switcher" htmlFor="campaign-select">
          Campaign
          <select id="campaign-select" defaultValue={campaigns[0]}>
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
            element={<Page title="Home" description="Welcome to the scheduling workspace." />}
          />
          <Route
            path="/campaigns"
            element={<Page title="Campaigns" description="Manage campaign goals and scheduling windows." />}
          />
          <Route
            path="/availability"
            element={<Page title="Availability" description="Track team and speaker availability in one place." />}
          />
          <Route
            path="/proposed-sessions"
            element={<Page title="Proposed Sessions" description="Review and confirm upcoming proposed sessions." />}
          />
        </Routes>
      </main>
    </div>
  );
}
