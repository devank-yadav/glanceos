# Security Policy

GlanceOS is self-hosted — you run the server, you own the data. We take security
seriously and appreciate responsible disclosure.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub's **“Report a vulnerability”** button on the
repository's **Security** tab (Security → Advisories → Report a vulnerability).
This opens a private advisory only the maintainers can see.

Please include:

- a description of the issue and its impact,
- steps to reproduce (a proof-of-concept if you have one),
- the affected version / commit, and
- any suggested remediation.

We aim to acknowledge a report within a few days and to keep you updated as we
investigate. Once a fix ships, we're happy to credit you in the advisory unless
you prefer to stay anonymous.

## Supported versions

GlanceOS is pre-1.0 and ships from `main`. Security fixes land on `main` and in
the next tagged release; please run a recent version before reporting.

## Threat model (what to expect)

GlanceOS is designed to be run on your own hardware or a host you control:

- **Auth** is a single account per install (scrypt-hashed password + signed
  session cookies); the first account created becomes the admin.
- **Secrets** (integration tokens, secret iCal URLs) are **encrypted at rest** and
  are never returned to the browser.
- **Outbound fetches** (smart-data URLs, integrations) go through an
  **SSRF-guarded egress** that blocks private/link-local/loopback ranges,
  IPv6-mapped addresses, and DNS-rebinding.
- **Public share links** are unguessable tokens, optionally password-protected
  (the password is presented via a signed cookie set by `/unlock`, never in the URL).
- Cookies are marked `Secure` + HSTS is sent when the server knows it's behind
  HTTPS (`GLANCEOS_PUBLIC_URL=https://…` or `GLANCEOS_SECURE_COOKIES=on`).

### Out of scope / by design

- **Plain HTTP on a trusted LAN** is an intended deployment for e-ink panels and
  TVs that can't do local TLS — see [docs/DEVICE-API.md](docs/DEVICE-API.md). If
  your server is internet-facing, put it behind HTTPS and set `GLANCEOS_PUBLIC_URL`.
- Anything requiring an attacker to already have your admin password or host
  access.

When in doubt, report it — we'd rather hear about a non-issue than miss a real one.
