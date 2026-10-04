# Command reference

53 commands total: `$help`, `$setchannel`, `$participants`, and 50 additional staff commands.

Staff means a member with role `1541427910198427809` or `1538609206763061308`. Administrator alone does not bypass staff access.

## Start here

| Command | What it does | Access |
| --- | --- | --- |
| `$help [command or category]` | Show every command, or help for one command. | Everyone |
| `$setchannel <channel ID>` | Choose the channel for the live leaderboard. | Administrator |
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
| `$pagesize <10–25>` | Set the number of players per leaderboard card. | Staff |

## Players

| Command | What it does | Access |
| --- | --- | --- |
| `$add <@member> [rank]` | Include a member, optionally assigning a rank. | Staff |
| `$remove <@member>` | Hide a member and clear their saved profile; keep Discord roles. | Staff |
| `$player <@member>` | Show a player’s rank, position, and recorded stats. | Staff |
| `$rename <@member> <name \| off>` | Set a board display name without changing the Discord nickname. | Staff |
| `$roblox <@member> <username \| off>` | Record a Roblox username for the board. | Staff |
| `$rank <@member> <rank>` | Assign one of the 12 ranks and remove their other rank roles. | Staff |
| `$promote <@member>` | Raise a member by one rank. | Staff |
| `$demote <@member>` | Lower a member by one rank. | Staff |
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
| `$ranks` | Show the exact rank order and mapped role IDs. | Staff |
| `$rankrole <rank> <role ID>` | Bind one of the 12 ranks to its Discord role. | Staff |
| `$rankclear <rank>` | Remove a role override and return to exact-name role matching. | Staff |
| `$rankmembers <rank>` | List players whose highest rank is the given rank. | Staff |
| `$rankstats` | Show participant counts per highest rank. | Staff |

## Settings

| Command | What it does | Access |
| --- | --- | --- |
| `$settings` | Show board settings and fixed access roles. | Staff |
| `$setlogchannel <channel ID>` | Choose a channel for staff command audit entries. | Staff |
| `$logoff` | Turn off Discord audit posts; keep local history. | Staff |
| `$interval <2–60>` | Set the fallback member-sync interval in minutes. | Staff |
| `$sync` | Fetch all members and roles, then rebuild the board. | Staff |

## Data

| Command | What it does | Access |
| --- | --- | --- |
| `$export` | Download the full standings as CSV. | Staff |
| `$backup` | Save a local backup and download its JSON copy. | Staff |
| `$backups` | List the 30 most recent local backups. | Staff |
| `$restore <backup ID>` | Restore settings and player data; keep the administrator’s channel choice. | Staff |
| `$history [1–30]` | Show recent saved changes and rank actions. | Staff |
| `$undo` | Undo a saved settings/player-data change; Discord roles are unaffected. | Staff |
| `$redo` | Redo a saved settings/player-data change; Discord roles are unaffected. | Staff |
| `$resetstats <@member>` | Reset one player’s recorded score, wins, and losses. | Staff |

For multiword ranks, use the exact name, e.g. `$rank @member Advanced III`.

For `$restore`, choose a local backup ID from `$backups`. Undo/redo/restore do not alter Discord roles or the selected board channel.
