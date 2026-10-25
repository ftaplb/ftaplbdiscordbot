# Command reference

87 commands. The default prefix is `$`; replace it with your server’s prefix if changed.

Staff means a member on the staff list or anyone with a configured staff role. The home server starts with roles `1541427910198427809` and `1538609206763061308`. Administrators can configure staff access, channels, prefixes, tracked roles, custom ranks, and recovery even without a staff role.

Evaluators get `setrank` and `removerank` only, plus public commands. Editors can also use `rank`, `promote`, and `demote`. Staff can manage editors, evaluators, staff members, and staff roles. Only home-server administrators can manage enabled servers.

## Common tasks

```text
$editor add @member
$editor remove @member
$evaluator add @member
$evaluator remove @member
$staff add @member
$staff remove @member
$staffrole add @role
$staffrole remove @role
$editors
$evaluators
$staff
$staffroles
$addsetrank @role
$setrank @member @role
$removesetrank @role
$regionrole North America @role
$devicerole PC @role
$storage
$backup
$restoreconfig BACKUP_ID
$importbackup  (attach the downloaded JSON file)
```

## Start here

| Command | What it does | Access |
| --- | --- | --- |
| `$help [command or category]` | Show every command, or help for one command. | Everyone |
| `$setchannel <channel ID>` | Choose the channel for the live leaderboard. | Staff or administrator |
| `$participants <1–100>` | Set the maximum number of players displayed. | Staff |

## Board

| Command | What it does | Access |
| --- | --- | --- |
| `$leaderboard` | Link to the live leaderboard. | Staff |
| `$refresh` | Rebuild the live board now, including while paused. | Staff |
| `$preview [page]` | Show a preview here without changing the live board. | Staff |
| `$status` | Show connection, update, and participant status. | Staff |
| `$pause` | Pause automatic leaderboard updates. | Staff |
| `$resume` | Resume automatic leaderboard updates. | Staff |
| `$title <text>` | Change the leaderboard title. | Staff |
| `$description <text>` | Change the leaderboard description. | Staff |
| `$footer <text>` | Change the leaderboard footer. | Staff |
| `$color <#RRGGBB>` | Change the board accent color. | Staff |
| `$thumbnail <https URL \| off>` | Set or remove the small embed image. | Staff |
| `$pagesize <10–50>` | Set the number of players per leaderboard table. | Staff |

## Players

| Command | What it does | Access |
| --- | --- | --- |
| `$add <@member> [rank]` | Include a member, optionally assigning a rank. | Staff |
| `$remove <@member>` | Hide a member and clear their saved profile; keep Discord roles. | Staff |
| `$player <@member>` | Show a player’s rank, position, and recorded stats. | Staff |
| `$rename <@member> <name \| off>` | Set a board display name without changing the Discord nickname. | Staff |
| `$roblox <@member> <username \| off>` | Record a Roblox username for the board. | Staff |
| `$rank <@member> <rank>` | Assign a configured rank and remove their other rank roles. | Editor or staff |
| `$promote <@member>` | Raise a member by one rank. | Editor or staff |
| `$demote <@member>` | Lower a member by one rank. | Editor or staff |
| `$score <@member> <number>` | Set a player’s manually recorded score. | Staff |
| `$wins <@member> <number>` | Set a player’s manually recorded wins. | Staff |
| `$losses <@member> <number>` | Set a player’s manually recorded losses. | Staff |
| `$exclude <@member>` | Hide a member while keeping their saved profile. | Staff |
| `$include <@member>` | Allow a member back onto the board if they have a rank role. | Staff |
| `$members [page]` | List ranked members, including those below the display limit. | Staff |

## Ordering

| Command | What it does | Access |
| --- | --- | --- |
| `$move <@member> <position>` | Move a member within their own rank; switch to manual sorting. | Staff |
| `$swap <@member> <@member>` | Swap two members within the same rank. | Staff |
| `$sort <manual \| name \| score \| wins>` | Choose sorting within each rank; rank order always comes first. | Staff |
| `$top [1–25]` | Show the highest-ranked members here. | Staff |
| `$search <name>` | Search Discord and recorded Roblox names. | Staff |
| `$compare <@member> <@member>` | Compare two members’ rank, position, and recorded stats. | Staff |

## Ranks

| Command | What it does | Access |
| --- | --- | --- |
| `$ranks` | Show the exact rank order and mapped role IDs. | Everyone |
| `$rankrole <rank> <role ID>` | Bind one of the 12 ranks to its Discord role. | Staff |
| `$rankclear <rank>` | Remove a role override and return to exact-name role matching. | Staff |
| `$rankmembers <rank>` | List players whose highest rank is the given rank. | Staff |
| `$rankstats` | Show participant counts per highest rank. | Staff |
| `$setrank <@member> <rank, alias, or @role>` | Assign a configured game rank. Staff can extend the list with $addsetrank. | Evaluator, editor, or staff |
| `$removerank <@member> [rank, family, or all]` | Remove game rank roles only. Use skillful to remove Skillful I–III. | Evaluator, editor, or staff |
| `$rankaliases` | List accepted full names, numbers, and abbreviations. | Everyone |
| `$addsetrank <@role> [display name]` | Allow editors/evaluators to assign a safe role. New ranks appear below the existing ranks. | Staff or administrator |
| `$removesetrank <@role or custom rank name>` | Remove a custom rank from the board and setrank list; keep members’ Discord roles. | Staff or administrator |

## Settings

| Command | What it does | Access |
| --- | --- | --- |
| `$settings` | Show saved board settings and staff access. | Staff |
| `$setlogchannel <channel ID>` | Choose a channel for staff command audit entries. | Staff |
| `$logoff` | Turn off Discord audit posts; keep local history. | Staff |
| `$interval <2–60>` | Set the fallback member-sync interval in minutes. | Staff |
| `$sync` | Fetch all members and roles, then rebuild the board. | Staff |
| `$prefix <prefix>` | Change this server’s command prefix. | Staff or administrator |

## Data

| Command | What it does | Access |
| --- | --- | --- |
| `$export` | Download the full standings as CSV. | Staff |
| `$backup` | Download a complete backup, including channels, access, prefix, and role mappings. | Staff |
| `$backups` | List the 30 most recent local backups. | Staff |
| `$restore <backup ID>` | Restore settings and player data; keep the administrator’s channel choice. | Staff |
| `$history [1–30]` | Show recent saved changes and rank actions. | Staff |
| `$undo` | Undo a saved settings/player-data change; Discord roles are unaffected. | Staff |
| `$redo` | Redo a saved settings/player-data change; Discord roles are unaffected. | Staff |
| `$resetstats <@member>` | Reset one player’s recorded score, wins, and losses. | Staff |
| `$storage` | Check the storage path and whether a Railway volume is configured. | Staff or administrator |
| `$restoreconfig <backup ID>` | Restore a complete local backup, including channel, prefix, access, and role mappings. | Staff or administrator |
| `$importbackup (attach JSON file)` | Restore a downloaded backup. Version 2 includes channels/access; legacy files restore board data only. | Staff or administrator |

## Servers

| Command | What it does | Access |
| --- | --- | --- |
| `$addserver <server ID>` | Enable another server. The bot must already be invited there. | Home-server administrator |
| `$removeserver <server ID>` | Disable a server while keeping its saved data. | Home-server administrator |
| `$servers` | List enabled servers and connection status. | Home-server administrator |

## Access

| Command | What it does | Access |
| --- | --- | --- |
| `$staff <add \| remove> <@member>` | Grant or revoke staff access in this server. | Staff or administrator |
| `$addstaff <@member or user ID>` | Alias for $staff add. | Staff or administrator |
| `$removestaff <@member or user ID>` | Alias for $staff remove. | Staff or administrator |
| `$editor <add \| remove> <@member>` | Grant or revoke editor access in this server. | Staff or administrator |
| `$editors` | List this server’s editors. | Staff or administrator |
| `$addeditor <@member or user ID>` | Alias for $editor add. | Staff or administrator |
| `$removeeditor <@member or user ID>` | Alias for $editor remove. | Staff or administrator |
| `$evaluator <add \| remove> <@member>` | Grant or revoke evaluator access in this server. | Staff or administrator |
| `$evaluators` | List this server’s evaluators. | Staff or administrator |
| `$addevaluator <@member or user ID>` | Alias for $evaluator add. | Staff or administrator |
| `$removeevaluator <@member or user ID>` | Alias for $evaluator remove. | Staff or administrator |
| `$staffroles` | List the roles that grant staff access. | Staff or administrator |
| `$staffrole <add \| remove> <@role>` | Grant or revoke staff access for a role. The old role-first syntax also works. | Staff or administrator |

## Profiles

| Command | What it does | Access |
| --- | --- | --- |
| `$playerprofile [@member]` | Show a member’s rank, region, device, Roblox name, and wins/losses. | Everyone |
| `$rating <@member> <number or off>` | Set or clear a player’s manually entered rating. | Staff |
| `$rd <@member> <number or off>` | Set or clear a player’s manually entered rd. | Staff |
| `$country <@member> <text or off>` | Set or clear a player’s country. | Staff |
| `$clan <@member> <text or off>` | Set or clear a player’s clan. | Staff |

## Role tracking

| Command | What it does | Access |
| --- | --- | --- |
| `$regions` | Show configured region roles. Multiple matches are shown together. | Everyone |
| `$regionrole <region name> <@role \| off>` | Change a tracked region role without redeploying. | Staff or administrator |
| `$devices` | Show configured device roles. Multiple matches are shown together. | Everyone |
| `$devicerole <device name> <@role \| off>` | Change a tracked device role without redeploying. | Staff or administrator |

## Rank aliases

| Rank | Alias |
| --- | --- |
| Fling God | `fg` |
| Advanced I / II / III | `adv1` / `adv2` / `adv3` |
| Expert I / II / III | `e1` / `e2` / `e3` |
| Skillful I / II / III | `sk1` / `sk2` / `sk3` |
| Apprentice | `app` |
| Casual | `cas` |

Numbered full names work too: `$setrank @member skillful 1`. A unique one-character typo is accepted; ambiguous or unknown names are rejected.

`$addsetrank @role` appends a custom tier below the built-in ranks. If the role has a built-in rank name or alias, it binds that existing tier instead. An optional display name can be supplied after the role mention. All configured ranks are mutually exclusive: setrank adds the selected role and removes other configured rank roles. Existing unrelated roles are preserved. Custom tiers use their display name, role mention, or ID. Staff, managed, @everyone, and roles with moderation permissions cannot be assigned as ranks. Keep the bot role above every rank role.

`$removerank @member skillful` removes Skillful I–III only. `$removerank @member e1` removes Expert I only. Omit the rank to remove all configured ranks, including custom tiers. `$removesetrank @role` removes a custom tier from configuration without removing existing Discord roles.

## Regions and devices

Region and Device follow the configured Discord role IDs; role changes refresh the board automatically. Missing roles show an em dash. Multiple matching roles appear together, separated by `/`. `$regions` and `$devices` show mappings. Staff can change mappings with `$regionrole Europe @role` or `$devicerole Mobile @role`; use `off` in place of the role to stop tracking a label. Server data is isolated; the supplied IDs apply to the home server only.

## Persistence and recovery

Every successful configuration change is saved immediately. Railway needs an attached persistent volume; `$storage` reports whether the configured data path is on that volume. The bot automatically uses `RAILWAY_VOLUME_MOUNT_PATH` unless `DATA_DIR` overrides it. Mount at `/data` and remove a conflicting DATA_DIR variable, or set DATA_DIR inside the volume.

`$backup` downloads a version 2 recovery file containing board settings, players, ordering, exclusions, custom ranks, region/device mappings, channels, message IDs, prefix, and all access lists. Keep these files in a staff-only channel. A local snapshot is also made daily when data is saved; the latest 30 are retained.

`$restore <ID>` and undo/redo restore board/player data while keeping channels, prefix, and access unchanged. They do not change Discord roles. Old version 1 local backups still work with restore. `$restoreconfig <ID>` restores the complete configuration from a local version 2 backup. `$importbackup` does the same from an attached JSON download and is useful after lost storage. Complete recovery is restricted to staff or administrators, validates the server ID and file contents, keeps a pre-recovery backup, and clears undo/redo. It restores saved message IDs so existing board posts can be edited rather than duplicated. Server enablement remains in the persistent servers.json registry.

Legacy version 1 downloaded files can also be attached to `$importbackup`. They restore board/player data only and cannot recover channels, access lists, or prefixes absent from the old file. Current choices are kept. Version 2 downloads include and validate the server ID.
