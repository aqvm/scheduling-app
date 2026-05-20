# DnD Group Scheduler

An invite-only availability board for tabletop groups that need to find the next session date without a spreadsheet, chat thread, or poll getting stale.

The app is intentionally small: members mark their availability, the host sees a ranked summary, and admins manage campaigns, invites, host assignment, and membership. The technical choices are all in service of that loop.

## Try It

To try the app without creating a campaign, sign in and join the `demo` campaign with invite code `E3N4-PANB-WUZH`.

## Why This Exists

Scheduling a DnD session is mostly a coordination problem, not a calendar problem. The group needs a shared source of truth that is easy for players to update and easy for the host to read.

This app optimizes for:

- Fast player input: click or drag across a month to paint availability as available, maybe, unavailable, or clear.
- Host clarity: hide past dates, rank future options, and show the full availability matrix when the host needs detail.
- Private group access: campaigns are invite-only, and invite codes can be disabled by admins.
- Minimal personal data: the app stores Firebase auth user IDs and user-chosen aliases, not email addresses or Google profile details.
- Low-ops hosting: static React frontend, Firebase Auth, and Firestore realtime state.

## Main Technical Decisions

### React + Vite for a Small Client App

The app is a single-page React application because almost all of the complexity is interaction state: selecting campaigns, editing availability, reading realtime updates, and switching between member, host, and admin views. Vite keeps local development and GitHub Pages deployment simple.

### Firebase Auth for Identity, Not Profiles

Google sign-in answers one question: "Is this the same person who joined before?" The app does not persist email addresses or Google profile metadata in Firestore. A signed-in user gets an in-app alias, and campaign membership can carry a campaign-specific alias.

### Firestore as the Shared Realtime Model

Firestore is the backend because this app needs live shared state but does not need a custom server. Campaigns, memberships, availability, invites, settings, and name-change requests are stored under a namespace:

```txt
apps/{namespace}/...
```

That namespace lets the same Firebase project host separate app partitions when needed.

### Invite-Only Campaigns

Campaigns are the core boundary. Admins create campaigns, each campaign gets one invite code, and players join through that code. Disabling the code stops new joins without removing existing members.

### Security Rules Carry the Trust Model

The frontend is not trusted to enforce authorization alone. Firestore rules define who can read, create, update, and delete each document type:

- Members can read campaign data only for campaigns they belong to.
- Members can write only their own availability.
- Admins can create campaigns, manage invites, assign hosts, review name-change requests, and remove members.

The host summary is a product-level view layered on top of campaign-scoped data: the UI exposes it only to the selected host and admins, while Firestore rules keep the underlying data scoped to campaign members and admins.

### Local Pending Edits Before Save

Availability editing keeps unsaved changes locally until the player saves. That makes painting dates feel responsive while still preserving an explicit "commit these changes" action.

## Application Shape

The code is organized around product features rather than technical layers:

- `src/features/auth`: Google sign-in entry point.
- `src/features/availability`: member availability editor.
- `src/features/host`: host summary and ranked date matrix.
- `src/features/admin`: campaign and membership management.
- `src/features/app`: app-level hooks, orchestration, and Firestore operations.
- `src/shared/scheduler`: shared scheduler types, date helpers, validation, status logic, and Firestore reference builders.

The main runtime flow starts in `src/App.tsx`: authenticate, resolve the current user's profile and memberships, select a campaign, then render the member, host, or admin view based on role and campaign state.

## Core Data Model

The app stores a small set of document types:

- `users`: app-local profile with alias and role.
- `campaigns`: campaign name, invite code, invite state, and creator.
- `campaignInvites`: lookup documents for invite-code joins.
- `memberships`: campaign/user joins with campaign-specific aliases.
- `availability`: per-user availability maps keyed by `YYYY-MM-DD`.
- `campaignSettings`: campaign host assignment.
- `nameChangeRequests`: admin-reviewed alias changes.

Shared TypeScript contracts live in `src/shared/scheduler/types.ts`, and Firestore path helpers live in `src/shared/scheduler/firebaseRefs.ts`.

## Local Development

```bash
npm ci
npm run dev
```

Create `.env.local` from `.env.example` and fill in the Firebase web app values before running against a real Firebase project.

## Useful Commands

```bash
npm run build
npm run preview
```

## Setup And Operations

Operational details live in [docs/setup.md](docs/setup.md):

- Firebase project setup
- Environment variables
- Admin bootstrap
- Firestore rules deployment
- GitHub Pages deployment
- Repository-name deployment note

## Privacy Posture

The app's privacy stance is deliberately narrow: store only what the scheduler needs. Current app documents should contain user-chosen aliases, Firebase auth UIDs, campaign membership, and availability statuses. Historical records from older data models should be scrubbed if they contain direct profile identifiers.
