# Scheduling App

Invite-only DnD scheduling app built with React + TypeScript + Vite + Firebase.

## Features

- Google sign-in + campaign invite-code onboarding
- Multi-campaign membership with global campaign selector
- One invite code per campaign, with admin enable/disable controls
- Dark-mode calendar UI
- Paint-style availability editing (click or click-drag)
- Sunday-first month grid with month picker
- Past dates are locked/greyed out, and today is highlighted
- Host summary view (host + admin access) with past-date filtering
- Admin-only campaign management to create campaigns, assign host, and remove members
- Realtime shared state across browser profiles/devices via Firestore

## Firebase Setup

1. Create a Firebase project.
2. In Firebase Console, enable `Authentication -> Sign-in method -> Google`.
3. In Firebase Console, add your deployed domain under `Authentication -> Settings -> Authorized domains`.
4. Create a Firestore database in production mode.
5. Copy `.env.example` to `.env.local` and fill in your Firebase values.
6. In GitHub repo settings, add Actions secrets for Firebase (list below).
7. Set your OAuth privacy policy URL to:
   - `https://<your-domain>/privacy-policy.html`
   - For GitHub Pages, this is typically `https://<username>.github.io/scheduling-app/privacy-policy.html`.

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

## Admin Bootstrap + Invite Codes

Initial admin bootstrap (required once per namespace):

- New user profiles are created with role `member` by design.
- After the first user signs in, promote that user to `admin` out-of-band (Firebase Console or Admin SDK).
- After an admin exists, use `Campaign Management` in-app to create campaigns and invite codes.

Invite-code flow:

- Admins create campaigns from `Campaign Management` in the app UI.
- Each campaign gets a single invite code that can be enabled or disabled.
- Users who sign in with a campaign invite code are added to that campaign.

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
