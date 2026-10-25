# Mara portfolio

Personal portfolio for **marasu.tech**, with a private project editor at **admin.marasu.tech**.

## Repository layout

- `public/` — public pages, CSS, JavaScript, and the images the site uses.
- `admin/` — private editor frontend, deployed to a separate Hosting site.
- `functions/` — Firebase HTTP API, Firestore/Storage adapter, and the original project seed.
- `scripts/` — isolated Hosting builds, deployment checks, and local file storage.
- `test/` — backend integration and shared project validation tests.
- `assets/originals/` — original photos and project screenshots, excluded from deployment.
- `dist/` — generated Hosting outputs, excluded from Git.
- `data/` — local preview data and uploads, excluded from Git.

## Local preview

Use Node.js 22 or later. Copy `.env.example` to `.env` and set a unique password of at least 8 characters. The placeholder password is deliberately rejected. A configured local `.env` may already exist from deployment setup; do not overwrite it unless you intend to change your local login.

```sh
npm ci
npm start
```

Open `http://localhost:3000` and `http://localhost:3000/admin.html`. If that port is busy, change `PORT`, `PUBLIC_ORIGIN`, and `ADMIN_ORIGIN` together in `.env`. Local preview uses disk storage and does not modify Firebase data.

```sh
npm ci --prefix functions
npm run check
npm test
npm audit --prefix functions --omit=dev
```

`check` validates JavaScript, links, seed images, password examples, and the separation between Hosting sites, then creates `dist/public` and `dist/admin`.

## Firebase deployment

Project: `portfolio-marasu`. Public Hosting site: `portfolio-marasu`. Admin Hosting site: `portfolio-marasu-admin`. Region: `asia-east1` for Cloud Functions, Firestore, and photo storage.

The full editor requires the Blaze plan for Cloud Functions and Cloud Storage. The API uses Firestore transactions to enforce the six-featured-project limit across instances. Photos live in the private bucket `portfolio-marasu.firebasestorage.app` and are served through the API. Direct Firestore and Storage client access is denied by security rules. Secrets and source files are excluded from both Hosting builds.

On a new machine, install the Firebase CLI, sign in, then install the locked dependencies:

```sh
npm install -g firebase-tools
firebase login
npm ci
npm ci --prefix functions
```

The initial setup creates a Firestore `(default)` database, the default Cloud Storage bucket, the second Hosting site, and the `ADMIN_PASSWORD` Secret Manager secret. These resources only need to be created once. For password rotation, use the command below, enter a unique password of at least 8 characters, and redeploy the function:

```sh
firebase functions:secrets:set ADMIN_PASSWORD --project portfolio-marasu
firebase deploy --only functions --project portfolio-marasu
```

The production password is a Secret Manager secret, not a frontend variable. Rotating it invalidates old sessions. The generated initial password is also saved in the ignored local `.env`; changing that file alone changes only your local preview password.

Production origins and the bucket are defined in `functions/index.js`. If needed, copy `functions/.env.example` to `functions/.env.portfolio-marasu` to override them. Keep all `.env` files out of Git.

Deploy everything:

```sh
npm run deploy
```

For subsequent frontend-only changes, after the API has been deployed:

```sh
npm run deploy:hosting
```

Hosting rewrites `/api/**` and `/uploads/**` to `portfolioApi`. The `__session` cookie name is required because Firebase Hosting strips other cookies before forwarding to functions. Cookies are Secure, HttpOnly, SameSite=Strict, and host-only. Sessions last eight hours and are persisted in Firestore. Expired session and login-attempt records use TTL cleanup; authentication also checks expiry itself. Login limits persist across instances. No public menu links to the admin site. The login UI itself is public; every editing operation requires a valid session.

Cloud Functions is limited to three instances with zero warm instances. Set a billing budget alert in Google Cloud; instance limits do not impose a total spending cap. Keep backups of Firestore and the photo bucket as appropriate. Redeploying never overwrites saved projects: the six original projects are seeded only when the project store is first initialized.

## Custom domains

In Firebase Console → Hosting, connect `marasu.tech` to `portfolio-marasu` and `admin.marasu.tech` to `portfolio-marasu-admin`. Add exactly the DNS records Firebase shows at your DNS provider. Remove conflicting A/AAAA/CNAME records only for those hostnames. Firebase provisions HTTPS after verification.

Admin mutations accept the configured admin origin, `https://admin.marasu.tech`, and the two Firebase-generated URLs for this specific admin site. You can sign in at `https://portfolio-marasu-admin.web.app` while custom-domain DNS is being configured. Each hostname has its own host-only session cookie.

## GitHub

Commit the source, Firebase rules/config, and both package lockfiles. `.env`, local data, uploaded preview photos, dependencies, logs, and generated builds are ignored. Never commit service-account keys. Deployment uses your Firebase CLI sign-in; no GitHub secret is required. The GitHub workflow runs checks and tests on pushes and pull requests, and does not deploy automatically.

```sh
git add .
git commit -m "Prepare portfolio and admin editor for Firebase"
git push origin main
```

Review `git diff --cached --stat` before committing. Original project images retain their existing provenance; template/vendor notices remain in the CSS and JavaScript files.
