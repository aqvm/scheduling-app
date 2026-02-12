# Scheduling App

Invite-only DnD scheduling app built with React + TypeScript + Vite.

## Features

- Invite-code sign-in with username (`member` and `admin` access)
- Dark-mode calendar UI
- Paint-style availability editing (click or click-drag)
- Sunday-first month grid with month picker
- Host summary view (host + admin access)
- Admin-only management page to view signed-in users and assign host

## Invite Code Setup

Configure invite codes with Vite environment variables:

```bash
VITE_MEMBER_INVITE_CODE=your-member-code
VITE_ADMIN_INVITE_CODE=your-admin-code
```

If not set, defaults are:

- Member: `party-members`
- Admin: `owner-admin`

## Run locally

```bash
npm ci
npm run dev
```

## Build locally

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

1. Push this repository to GitHub on the `main` branch.
2. In GitHub, open `Settings -> Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main` (or re-run the workflow in `Actions`).
5. Your site will be published after the `Deploy to GitHub Pages` workflow completes.

## Repo Name Note

`vite.config.ts` currently uses:

```ts
base: '/scheduling-app/'
```

If your GitHub repository name changes, update that value to match the new repo path.
