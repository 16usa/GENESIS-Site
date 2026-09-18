GENESIS Site v1
===============

Files:
- server.js: dependency-free Node server; uses Replit PORT automatically.
- public/index.html: website.
- public/styles.css: all styling.
- public/app.js: live counters, contract copy, countdown.
- public/config.js: edit token address, Pump.fun URL, explorer URL, burn %, stats.
- install.sh: installs to ~/workspace by default, creates backup, DOES NOT restart anything.

Install from Replit Shell after uploading and unzipping:
  bash install.sh

Or specify another target:
  bash install.sh /path/to/project

Run manually:
  npm start

Edit public/config.js when the token is live.
