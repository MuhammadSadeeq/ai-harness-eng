# Launch: what is ready, and the owner's steps

Phase 7 (SPEC §10) ends with **the owner's acceptance**. Everything below the
line "Your steps" needs you: the director does not change
repository settings or publish anything.

## What is ready (verified on the branch `claude/funny-darwin-daqksa`)

- **The course.** Every module of every part is built and passed the Phase 3
  to 6 gates (`docs/PHASE3-GATE.md` to `docs/PHASE6-GATE.md`); the five-area
  audit and its second round found no blocker left.
- **Checked where it will live.** QA serves the site under a folder, as
  GitHub Pages serves a project site, and passed every page that way (D-064).
  The service worker, which would never have registered on Pages, now does.
- **Deploy.** `.github/workflows/pages.yml` uploads `site/` only, and only for
  a commit on the default branch whose CI run passed. `source/` (the study book) and
  `capstone/` (with the Rust reference) are never uploaded.
- **Facts freshness.** `.github/workflows/facts-freshness.yml` runs every
  Monday: it flags volatile facts older than 75 days and dead source links.
- **The first session.** A timed walkthrough as a newcomer on a phone and an
  engineer on a laptop (`docs/gate/phase7-first-session.md`); its findings are
  fixed: the first module's facts, a next step at the end of every module,
  and a way to the placement from the home page.
- **README** for launch.

## Your steps

1. **Make the repository public** (Settings → General → Danger zone →
   Change visibility), or keep it private on a paid plan (GitHub Pro, Team or
   Enterprise), which Pages on a private repository needs. You chose to share
   everything for learning (D-065), so `source/` may stay in a public
   repository; it is still not deployed.
2. **Decide whether the Rust capstone's reference ships** (D-046):
   `capstone/reference/` is a full solution. It is never deployed, but a
   public repository shows it; the default is to keep it out of a public one,
   since a public solution undercuts the portfolio value.
3. **No merge is needed.** `claude/funny-darwin-daqksa` is the repository's
   only branch and its default branch, and the Pages workflow deploys the
   default branch, whatever its name. To rename it to `main`, use Settings →
   Branches; the workflow needs no change.
4. **Turn on Pages:** Settings → Pages → Build and deployment → Source:
   **GitHub Actions**. The first deploy runs the next time CI passes on the
   default branch, or by hand from Actions → Pages → Run workflow.
5. **Open the site** at the Pages address (for this repository,
   `https://muhammadsadeeq.github.io/ai-harness-eng/`), start the first
   module, and accept, or name what to change.
6. **Optional:** a launch film (SPEC §10 lists it as optional); not made.
