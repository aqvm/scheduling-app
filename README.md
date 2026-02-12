# Scheduling App

Invite-only DnD scheduling app built with React + TypeScript + Vite + Firebase.

## Features

- Invite-code sign-in with username (`member` and `admin` access)
- Dark-mode calendar UI
- Paint-style availability editing (click or click-drag)
- Sunday-first month grid with month picker
- Host summary view (host + admin access)
- Admin-only management page to view signed-in users and assign host
- Realtime shared state across browser profiles/devices via Firestore

## Firebase Setup

1. Create a Firebase project.
2. In Firebase Console, enable `Authentication -> Sign-in method -> Anonymous`.
3. Create a Firestore database in production mode.
4. Copy `.env.example` to `.env.local` and fill in your Firebase values.

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
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isAdmin(uid) {
      return get(/databases/$(database)/documents/apps/default/users/$(uid)).data.role == 'admin';
    }

    match /apps/default/users/{userId} {
      allow read: if signedIn();
      allow create: if signedIn() && request.auth.uid == userId;
      allow update: if signedIn() && request.auth.uid == userId;
    }

    match /apps/default/availability/{userId} {
      allow read: if signedIn();
      allow create, update: if signedIn() && request.auth.uid == userId;
    }

    match /apps/default/meta/settings {
      allow read: if signedIn();
      allow create, update: if signedIn() && isAdmin(request.auth.uid);
    }
  }
}
```

If you use a different `VITE_FIREBASE_APP_NAMESPACE`, update rules paths to match.

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
