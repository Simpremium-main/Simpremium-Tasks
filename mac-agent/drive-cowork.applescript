-- drive-cowork.applescript
--
-- UNVERIFIED. Written without being able to see Claude Desktop's actual
-- Cowork UI running on a real Mac (this was built from a sandbox with no
-- access to any Mac at all) — every step marked "TODO/verify" below is a
-- best guess at the general shape of a desktop chat app, not a confirmed
-- fact about Cowork specifically. Test this by itself first (see
-- mac-agent/README.md's "The part that needs your testing" section)
-- before trusting agent.js to run it unattended, and adjust the
-- keystrokes/delays/app name below to match what you actually see happen.
--
-- Usage: osascript drive-cowork.applescript /path/to/prompt.txt

on run argv
	set promptFile to item 1 of argv

	-- Load the prompt text into the clipboard rather than typing it out
	-- with `keystroke` character by character, which is slow, can drop
	-- characters on a long prompt, and doesn't handle non-ASCII text
	-- (accents, emoji) reliably.
	set promptText to read POSIX file promptFile as «class utf8»
	set the clipboard to promptText

	-- TODO/verify: confirm "Claude" is this app's actual process/display
	-- name on your Mac. Check your Applications folder, or run
	-- `ps aux | grep -i claude` in Terminal while the app is open.
	tell application "Claude"
		activate
	end tell
	delay 1.5

	tell application "System Events"
		tell process "Claude"
			set frontmost to true
			delay 0.5

			-- TODO/verify: this assumes Cmd+N starts a new
			-- conversation/task and that the prompt input field ends up
			-- focused automatically afterward. Cowork specifically might
			-- need a different shortcut, a menu item (check the app's
			-- menu bar for a "New Cowork Task" command), or clicking a
			-- specific button instead — watch what actually happens the
			-- first time you run this manually and adjust below.
			keystroke "n" using {command down}
			delay 1

			-- Paste the prompt (already on the clipboard) into whatever
			-- field is focused.
			keystroke "v" using {command down}
			delay 0.5

			-- TODO/verify: confirm Return actually submits rather than
			-- inserting a newline in Cowork's input — some chat UIs need
			-- Cmd+Return or Shift+Return to submit vs. a plain Return for
			-- a line break, or have a separate "Send" button to click
			-- instead of any keystroke at all.
			key code 36 -- Return
		end tell
	end tell

	return "dispatched"
end run
