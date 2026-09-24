-- drive-cowork.applescript
--
-- CONFIRMED WORKING (tested against a real Mac mini) for the default,
-- single-instance path below: "Claude" as the app's process name, ⌘N for a
-- new Cowork task, ⌘V to paste into the auto-focused prompt field, and a
-- plain Return to submit. See mac-agent/README.md's "Testar o AppleScript"
-- section — still worth re-testing on a fresh machine or after a Claude
-- Desktop update, but don't change the confirmed sequence below without a
-- reason.
--
-- Usage: osascript drive-cowork.applescript /path/to/prompt.txt [pid]
--
-- The optional [pid] targets ONE SPECIFIC running Claude Desktop process by
-- its unix process id — UNVERIFIED, added for Skill.accountSplit's
-- multi-instance setup (see mac-agent/README.md's "Multi-account skills"
-- section), never run on a real Mac. Several separate `--user-data-dir`
-- instances share the same process name ("Claude"), so the confirmed
-- `tell application "Claude" to activate` (name-keyed, ambiguous with more
-- than one running) can't be trusted to pick the right one — this branch
-- instead sets frontmost via System Events alone, scoped to the exact pid
-- agent.js found through `ps` (never guessed by name/order). Omitted
-- entirely, behavior is identical to before this existed.

on run argv
	set promptFile to item 1 of argv
	set targetPid to ""
	if (count of argv) > 1 then set targetPid to item 2 of argv

	-- Load the prompt text into the clipboard rather than typing it out
	-- with `keystroke` character by character, which is slow, can drop
	-- characters on a long prompt, and doesn't handle non-ASCII text
	-- (accents, emoji) reliably.
	set promptText to read POSIX file promptFile as «class utf8»
	set the clipboard to promptText

	if targetPid is "" then
		-- Confirmed-working default path, unchanged.
		tell application "Claude"
			activate
		end tell
		delay 1.5

		tell application "System Events"
			tell process "Claude"
				set frontmost to true
				delay 0.5
				keystroke "n" using {command down}
				delay 1
				keystroke "v" using {command down}
				delay 0.5
				key code 36 -- Return
			end tell
		end tell
	else
		-- UNVERIFIED multi-instance path — see header comment above.
		tell application "System Events"
			set targetProcess to first process whose unix id is (targetPid as integer)
			set frontmost of targetProcess to true
			delay 1.5

			tell targetProcess
				keystroke "n" using {command down}
				delay 1
				keystroke "v" using {command down}
				delay 0.5
				key code 36 -- Return
			end tell
		end tell
	end if

	return "dispatched"
end run
