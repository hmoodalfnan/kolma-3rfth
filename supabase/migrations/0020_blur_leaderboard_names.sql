-- Deeds tracker: let a trip screen student names on the leaderboard.
--
-- A manager may want to show the board to the room — projected on a wall, or
-- passed around — without every student's name on display beside their rank.
-- This adds a per-trip switch that blurs every name on the manager leaderboard,
-- the group breakdowns, and the name in the student-detail popup.
--
-- It is a visual screen for showing the board, not a security control: the switch
-- lives in trip settings, is shared by everyone who runs the trip, and flips all
-- names on or off at once. There is deliberately no per-viewer reveal toggle —
-- turning the setting off is how you reveal the names.
--
-- Safe to re-run.

alter table schedules
  add column if not exists blur_leaderboard_names boolean not null default false;
