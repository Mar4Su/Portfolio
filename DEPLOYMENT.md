# Deployment handoff

Firebase project: `portfolio-marasu`.

Public site: https://portfolio-marasu.web.app

Admin site: https://portfolio-marasu-admin.web.app

## Connect the domains

Both custom domains have been registered with Firebase Hosting. Add these records in the DNS dashboard for `marasu.tech`:

| Type | Host / Name | Value |
| --- | --- | --- |
| A | `@` | `199.36.158.100` |
| TXT | `@` | `hosting-site=portfolio-marasu` |
| CNAME | `admin` | `portfolio-marasu-admin.web.app` |
| TXT | `_acme-challenge` | `Ubimj2lNHQKC1O0BwDkZpL8CPZOWM10cOdNJDtGj8Z8` |
| TXT | `_acme-challenge.admin` | `BzPQJ46TTYw8UMT-bRRZlAhCC7EbHZX82JRPGYZOrYk` |

The last two records are the certificate challenges returned by Firebase during initial setup. If Firebase rotates them before you add them, use the current values shown in Firebase Console → Hosting for each custom domain. Some DNS dashboards want the full domain in the Name field; most expect the short names above. Keep your existing Zoho mail TXT/MX records. Remove only conflicting website A/AAAA/CNAME records for the exact hostnames being connected. Manage these records at `manage.get.tech` in your domain's DNS management panel. Firebase does not require a nameserver change; records must be saved in the zone served by the domain's authoritative nameservers.

After DNS verifies, Firebase provisions HTTPS. The desired production URLs are https://marasu.tech and https://admin.marasu.tech. Domain setup and certificate state are shown at https://console.firebase.google.com/project/portfolio-marasu/hosting/sites.

## Password

The initial admin password is stored in Firebase Secret Manager. Its local copy is the `ADMIN_PASSWORD` value in the ignored root `.env` file. Open that file locally to copy it; do not upload it to GitHub or paste it into chat. Use the password rotation commands in README.md when you want to choose a replacement.

## Publish source to GitHub

The source folders are ready to review and commit. `public/` replaces the old `mara-1.0.8/` folder. Git recognizes the file moves when staged. Build outputs, dependency folders, logs, local project data, and secrets are ignored.

```sh
git add .
git diff --cached --stat
git commit -m "Prepare portfolio and admin editor for Firebase"
git push origin main
```

Future deployments: `npm run deploy`. Frontend-only updates after the API is deployed: `npm run deploy:hosting`.
