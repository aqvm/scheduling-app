# Setup And Operations

This page keeps deployment and Firebase details out of the README while leaving the operational checklist close to the code.

## Firebase Setup

1. Create a Firebase project.
2. In Firebase Console, enable `Authentication -> Sign-in method -> Google`.
3. In Firebase Console, add your deployed domain under `Authentication -> Settings -> Authorized domains`.
4. Create a Firestore database in production mode.
5. Copy `.env.example` to `.env.local` and fill in your Firebase values.
6. In GitHub repo settings, add Actions secrets for Firebase.
7. Set your OAuth privacy policy URL to:
   - `https://<your-domain>/privacy-policy.html`
   - For GitHub Pages, this is typically `https://<username>.github.io/scheduling-app/privacy-policy.html`.

## Environment Variables

Required:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

Optional:

```bash
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_NAMESPACE=default
```

## Firestore Security Rules

The rules for this app are versioned in `firestore.rules`. They should be deployed to the Firebase project backing the app.

## GitHub Actions Secrets

`.github/workflows/deploy.yml` expects these secrets:

Required:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

Optional:

- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_NAMESPACE` (defaults to `default`)

`.github/workflows/deploy-firestore-rules.yml` expects:

- `FIREBASE_PROJECT_ID` as either a secret or repository variable.
- `FIREBASE_SERVICE_ACCOUNT`, a JSON service account credential with Firestore rules deploy permissions.

## Firestore Rules Deploy

If you want rules versioned and deployed from this repo:

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

## Admin Bootstrap And Invite Codes

Initial admin bootstrap is required once per namespace:

- New user profiles are created with role `member` by design.
- After the first user signs in, promote that user to `admin` out-of-band in Firebase Console or with the Admin SDK.
- After an admin exists, use `Campaign Management` in the app to create campaigns and invite codes.

Invite-code flow:

- Admins create campaigns from `Campaign Management`.
- Each campaign gets a single invite code that can be enabled or disabled.
- Users who sign in with a campaign invite code are added to that campaign.

## Deploy To GitHub Pages

1. Push this repository to GitHub on the `main` branch.
2. In GitHub, open `Settings -> Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main` or re-run the workflow in `Actions`.
5. Your site will be published after the `Deploy to GitHub Pages` workflow completes.

## Repo Name Note

`vite.config.ts` currently uses:

```ts
base: '/scheduling-app/'
```

If the GitHub repository name changes, update that value to match the new repo path.
