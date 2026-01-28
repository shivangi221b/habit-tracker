# Habit Tracker

A lightweight, single-page habit tracker that runs entirely in your browser (no backend). Add habits, tap days on a 2‑week calendar to mark completions, and see which habit needs attention today.

## Features
- Today’s focus: surfaces the habit with the lowest recent completion rate.
- Per-habit 14-day calendar for quick editing of past days.
- Streaks and 7-day completion rates, stored in `localStorage` (per device).
- Inline menu for renaming, edit history, and deleting habits.
- “New Habit” modal with back-filled completions to seed your starting streak.

## How to use
1) Open `index.html` in your browser.  
2) Click “New Habit” to add one, optionally preselecting completed days.  
3) Tap any day in the habit’s calendar (or use Edit History) to toggle done/undone.  
4) Use the focus card to quickly complete today’s most-needed habit.

## Tech stack
- Plain HTML, CSS, and JavaScript.
- Persistence via `localStorage` (data stays on the same browser/device).

## Notes
- Dates render in your local timezone using MM/DD/YYYY formatting.
- No accounts, syncing, or external services—everything is local.***
