# Scheduling App

Invite-only DnD scheduling app built with React + TypeScript + Vite + Firebase.

## Features

- Google sign-in + invite-code onboarding (`member` and `admin` access)
- Dark-mode calendar UI
- Paint-style availability editing (click or click-drag)
- Sunday-first month grid with month picker
- Past dates are locked/greyed out, and today is highlighted
- Host summary view (host + admin access)
- Admin-only management page to view signed-in users and assign host
- Realtime shared state across browser profiles/devices via Firestore

## Firebase Setup

1. Create a Firebase project.
2. In Firebase Console, enable `Authentication -> Sign-in method -> Google`.
3. In Firebase Console, add your deployed domain under `Authentication -> Settings -> Authorized domains`.
4. Create a Firestore database in production mode.
5. Copy `.env.example` to `.env.local` and fill in your Firebase values.
6. In GitHub repo settings, add Actions secrets for Firebase (list below).

Required env vars:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

Optional env vars:

```bash
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_NAMESPACE=default
```

Suggested Firestore security rules for this app:

```txt
Copy from `firestore.rules` in this repo.
```

GitHub Actions secrets expected by `.github/workflows/deploy.yml`:

Required:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

Optional:

- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_NAMESPACE` (defaults to `default`)
- `VITE_MEMBER_INVITE_CODE` (defaults to `party-members`)
- `VITE_ADMIN_INVITE_CODE` (defaults to `owner-admin`)

GitHub Actions secrets expected by `.github/workflows/deploy-firestore-rules.yml`:

Required:

- `FIREBASE_PROJECT_ID` (or repo variable `FIREBASE_PROJECT_ID`)
- `FIREBASE_SERVICE_ACCOUNT` (JSON service account credential with Firestore rules deploy permissions)

## Firestore Rules Deploy (Optional CLI)

If you want rules versioned/deployed from this repo:

1. Install Firebase CLI:

```bash
npm i -g firebase-tools
```

2. Copy `.firebaserc.example` to `.firebaserc` and set your Firebase project ID.
3. Login and deploy rules:

```bash
firebase login
firebase deploy --only firestore:rules
```

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
