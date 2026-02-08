# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, send an email to the maintainer or use [GitHub's private vulnerability reporting](https://github.com/davicedraz/habitica-google-calendar/security/advisories/new) feature.

Please include:

- A description of the vulnerability
- Steps to reproduce the issue
- Any relevant logs or screenshots

We will acknowledge your report within **48 hours** and work toward a fix as quickly as possible.

## API Token Safety

This project requires Habitica API credentials to function. Please follow these guidelines:

- **Never** commit your `HABITICA_ID` or `HABITICA_TOKEN` to source control.
- Store credentials exclusively in Apps Script's **Script Properties** (Project Settings > Script Properties).
- If you believe your token has been exposed, regenerate it immediately at [habitica.com/user/settings/api](https://habitica.com/user/settings/api).

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |

## Scope

This policy covers the code in this repository. Issues related to the Habitica API or Google Apps Script platform itself should be reported to those respective projects.
