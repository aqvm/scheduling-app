# Scheduling App POC

A lightweight proof-of-concept scheduling app built with React + TypeScript + Vite.

## What this POC includes

- Campaign selector with shared scheduling context
- Dashboard KPIs for sessions and participation
- Availability matrix by person and timeslot
- Proposed session form with conflict checks
- Hash-based routing for GitHub Pages compatibility

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

## Important repo-name note

`vite.config.ts` currently uses:

```ts
base: '/scheduling-app/'
```

If your GitHub repository name changes, update that value to match the new repo path.
