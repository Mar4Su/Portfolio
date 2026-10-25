# Mara portfolio

The public site lives in `mara-1.0.8`. A small Node server stores projects and uploaded photos on disk. Run this server to use the admin editor; static-only hosting cannot save admin changes.

## Run locally

Install Node.js 22 or later. Copy `.env.example` to `.env`, set a unique `ADMIN_PASSWORD` of at least 16 characters, and use these local settings:

```dotenv
PORT=3000
PUBLIC_ORIGIN=http://localhost:3000
ADMIN_ORIGIN=http://localhost:3000
COOKIE_SECURE=false
```

Run `npm start`. Open `http://localhost:3000` for the portfolio and `http://localhost:3000/admin.html` for the editor. No dependency installation is needed. Run `npm test` for the server integration checks.

## Deploy marasu.tech and admin.marasu.tech

Use a host that runs a persistent Node process with persistent disk (a VPS or a Node hosting service with a mounted disk). Configure:

```dotenv
ADMIN_PASSWORD=your-long-unique-secret
PUBLIC_ORIGIN=https://marasu.tech
ADMIN_ORIGIN=https://admin.marasu.tech
COOKIE_SECURE=true
PORT=3000
DATA_DIR=/var/lib/marasu
```

Point DNS for both domains to the host. Send both domains through an HTTPS reverse proxy to this Node process. For example, Caddy provisions HTTPS with:

```caddyfile
marasu.tech, admin.marasu.tech {
    reverse_proxy 127.0.0.1:3000
}
```

If your platform connects to a network port rather than a local reverse proxy, set `HOST=0.0.0.0`. Set `PORT` to the platform's assigned port. Preserve the original Host header so the app recognizes the admin domain.

Start the app with `npm start` under your process manager. Visit `https://admin.marasu.tech` and enter the password. There is no public admin navigation link. Admin routes are unavailable on the public hostname. Authentication uses an eight-hour, host-only HttpOnly session cookie; restarting the server signs everyone out. Login attempts are throttled. Changing `ADMIN_PASSWORD` and restarting rotates access.

The editor supports adding, editing, deleting, photo uploads (PNG/JPEG/WebP up to 5 MB), and a **Preview on index** switch on each project. Up to six can be enabled; disable one before featuring another. Every saved project appears on `projects.html` regardless of its preview switch.

Back up the entire `DATA_DIR` including `projects.json` and `uploads/`. This directory must survive redeploys and be writable by the Node process. Run one server instance against it; this file store is not intended for multiple replicas. Original project content seeds the database only on first launch. Public pages can show the original seeded projects on a static preview when the API is unavailable.

The DNS, HTTPS hosting, persistent disk, and production password must be configured before the live admin subdomain works.
