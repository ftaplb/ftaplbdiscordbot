# FTAP leaderboard bot

A Discord leaderboard for **Fling Things and People**, built with JavaScript, discord.js, and generated PNG tables. The layout uses compact rows and columns for player, rank, rating, RD, country, and clan.

Server `1502470371826204772` is the home server. Its administrators can enable other servers with `$addserver <id>`. Every server has its own leaderboard channel, prefix, access lists, profiles, backups, and settings.

The bot watches the 12 game rank roles, sorts them from Fling God to Casual, and edits its existing leaderboard posts when ranks change. Rank changes are grouped over a three-second window. A full member sync runs every two minutes by default to catch missed events.

## Discord setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) in Brave. Create an application, then open **Bot**.
2. Enable **Server Members Intent** and **Message Content Intent**. These are required for rank tracking and `$` commands. See [Discord's intent documentation](https://docs.discord.com/developers/events/gateway#privileged-intents).
3. Copy the bot token into Railway's `DISCORD_TOKEN` variable, or your local `.env` file. Keep it out of GitHub.
4. In **OAuth2 → URL Generator**, select the `bot` scope. Select **View Channels**, **Send Messages**, **Embed Links**, **Attach Files**, **Read Message History**, and **Manage Roles**. Manage Roles is required for `$setrank` and `$removerank`.
5. Open the generated invite URL and add the bot to the home server. Put its role above the 12 game rank roles and the members it will manage. The bot itself does not need Administrator.

## Railway

1. Create a Railway project and choose **Deploy from GitHub repo** → `ftaplb/ftaplbdiscordbot`.
2. Add a persistent **Volume** to the bot service and mount it at `/data`.
3. In the service's **Variables**, set:

   ```text
   DISCORD_TOKEN=your_actual_bot_token
   DATA_DIR=/data
   ```

4. Deploy. `railway.json` selects the Dockerfile and a restart-on-failure policy. The image includes Node 24 and the fonts used by the leaderboard tables.
5. Keep a single running instance. This bot uses JSON files on one volume. The service needs to stay running; leave serverless/sleeping mode off.
6. In deployment logs, look for `Connected as ...`. In Discord, run `$help`, then have an administrator run `$setchannel <channel ID>`.

The bot uses a Discord gateway connection and does not need a public domain or HTTP healthcheck. The volume keeps settings, player profiles, backups, and message IDs across deployments. Railway volumes attach at runtime; they are configured in the dashboard, not by `railway.json`. [Volume reference](https://docs.railway.com/volumes/reference) · [Deployment configuration](https://docs.railway.com/config-as-code/reference).

## First commands

```text
$setchannel 123456789012345678
$participants 100
$addevaluator @member
$setrank @member sk1
$playerprofile @member
$roblox @member speedproaso
$rename @member Chamo
$pagesize 25
$preview
```

Replace the sample channel ID with your actual channel ID. Enable Developer Mode in Discord, then right-click the channel and copy its ID. Mentions above are actual Discord member mentions, not typed display names. Rank names can contain spaces; quotes are optional:

```text
$setrank @member skillful 1
$setrank @member e2
$removerank @member skillful
$rankrole Advanced I 123456789012345678
```

The board automatically finds roles with these names or their exact aliases, in this fixed order:

1. Fling God
2. Advanced III
3. Advanced II
4. Advanced I
5. Expert III
6. Expert II
7. Expert I
8. Skillful III
9. Skillful II
10. Skillful I
11. Apprentice
12. Casual

If a role has a decorated name, use `$rankrole <rank> <role ID>` to bind it explicitly. Duplicate role names require an explicit binding. Every player appears once under their highest rank. Bots, unranked members, excluded members, and members who leave the server are omitted. Staff roles and unrelated roles do not make someone a participant.

Accepted aliases:

| Rank | Alias |
| --- | --- |
| Fling God | `fg` |
| Advanced I / II / III | `adv1` / `adv2` / `adv3` |
| Expert I / II / III | `e1` / `e2` / `e3` |
| Skillful I / II / III | `sk1` / `sk2` / `sk3` |
| Apprentice | `app` |
| Casual | `cas` |

Full numbered names also work, such as `skillful 1` or `expert 3`. Command rank inputs tolerate a unique one-character typo; ambiguous or unknown names are rejected. Automatic role discovery uses exact names and aliases, not typo matching.

`$removerank @member skillful` removes Skillful I–III. `$removerank @member sk1` removes Skillful I only. `$removerank @member` removes all 12 game ranks that member holds. Other roles are preserved. `$setrank` gives one game rank and removes the member’s other game rank roles.

`$participants 1–100` sets the display limit. For example, if the limit is 100 and 32 members have rank roles, the board shows 32 actual participants. It never fills empty places with made-up players. Everyone with an eligible role remains available in `$members` and `$export`, even if they fall below the display limit.

By default, ties within a rank use a saved manual order, then alphabetical order. `$move` and `$swap` change positions **within the same rank**. `$sort score` and `$sort wins` also sort within ranks; a lower rank never overtakes a higher one.

Rating, RD, country, clan, Roblox usernames, wins, and losses are entered by staff. `$rating` uses the same value as the existing `$score` command. Unset table cells show `—`; no rating or RD is calculated automatically. The bot does not read Roblox game statistics or verify ownership of Roblox accounts.

```text
$rating @member 1800
$rd @member 110
$country @member Germany
$clan @member WN
$playerprofile @member
```

## Other servers

1. Invite the same bot to the other server using its invite URL.
2. In the home server, an administrator runs `$addserver <other server ID>`.
3. In the new server, an administrator runs `$setchannel <channel ID>` and `$addevaluator @member` or `$addeditor <user ID>`.
4. To use the broader staff commands there, the local administrator chooses a staff role with `$staffrole <role ID>`. Game rank roles cannot double as staff access roles.

The bot must already be invited before `$addserver` is run; that command authorizes a server, rather than inviting the bot. An administrator of a secondary server cannot enable more servers. `$servers` lists enabled servers, and `$removeserver <id>` disables a secondary server while retaining its saved data.

Change a server’s prefix with `$prefix !` or `$prefix ft!`. The prefix is 1–8 characters without spaces, backticks, or angle brackets. After `$prefix !`, use `!help`, `!setrank`, and so on. Other servers keep their own prefix.

## Command access

- **Everyone:** `$help`, `$rankaliases`, and `$playerprofile`.
- **Evaluators:** `$setrank` and `$removerank`, in addition to public commands.
- **Editors:** the evaluator commands plus `$rank`, `$promote`, and `$demote`.
- **Administrator:** `$setchannel`, `$prefix`, `$addeditor`, `$removeeditor`, `$editors`, `$addevaluator`, `$removeevaluator`, `$evaluators`, and `$staffrole`.
- **Home-server administrator:** `$addserver`, `$removeserver`, and `$servers`.
- **Staff:** the existing board, player-data, ranking, and backup tools in [COMMANDS.md](COMMANDS.md). The home server starts with roles `1541427910198427809` and `1538609206763061308`. Additional servers start without a staff role; their administrator configures one locally.

Editors and evaluators are stored by Discord user ID for that server. They do not receive a Discord role or general moderation powers. Removing evaluator/editor access takes effect on the next command. If a user also holds a staff role or Administrator, those independent permissions remain.

Administrators without a configured staff role do not bypass staff commands. These rules are checked against freshly fetched membership on every command. Commands in disabled servers or DMs are ignored. The bot suppresses mentions in replies and board updates.

Rank assignment commands can only assign the mapped game rank roles. Staff, managed, or privileged roles cannot be assigned as game ranks. Discord still requires the bot's role to be high enough to manage the target member.

## Saved data and recovery

Data is stored under `DATA_DIR`, or `./data` locally. The enabled-server registry is `servers.json`. Each server has its own `servers/<server ID>/state.json` and `backups/` directory. State files are replaced atomically after each change, and leaderboard message IDs are saved after each successful post. On restart, the bot fetches the full member list before publishing and reuses the saved posts. If a board post is deleted, it is recreated during an update. Lowering the participant limit removes surplus board pages.

On the first startup after upgrading from the original single-server version, the bot copies the old `state.json` and backups into the home server’s directory. Existing settings, player profiles, custom order, and message IDs are preserved. The old files remain available for recovery. No new Railway variables are required.

`$backup` saves a local snapshot and sends a downloadable JSON copy. `$backups` lists saved IDs; `$restore <ID>` restores one. The newest 30 backups, 50 undo changes, and 200 history entries are retained. Downloaded backup copies are for safekeeping; `$restore` reads a local saved backup ID, not an uploaded attachment.

`$undo`, `$redo`, and `$restore` affect saved board settings and player profiles. They do not change Discord roles, the selected leaderboard channel, the prefix, access lists, or enabled servers. To reverse a role assignment, use `$setrank` again. `$remove` hides a player and clears their profile; `$exclude` hides them while keeping that profile. `$include` allows them back if they have an eligible rank role.

## Local development

Use Node 22 or newer; Node 24 is used on Railway.

```powershell
npm ci
Copy-Item .env.example .env
# Edit .env and set DISCORD_TOKEN.
npm start
```

```text
npm run check
npm test
npm run preview
```

The preview command writes `preview.png` using sample names, ratings, and profile fields to show the table layout. It never adds these samples to any live server. Tests run without a Discord token and cover evaluator/editor restrictions, rank aliases, role-only changes, server isolation, prefix changes, data migration, board updates, recovery, and rendering. Live Discord operation still needs the token, enabled intents, and server permissions. The Dockerfile needs a Docker-capable environment to build.

## Common fixes

- **The bot is offline:** check the token and both privileged intents, then read the Railway deployment logs.
- **Commands are ignored:** use a server text channel, check Message Content Intent, and give the bot access to that channel.
- **The board is empty:** run `$ranks`; missing or ambiguous roles need `$rankrole` bindings. Check Server Members Intent.
- **Roles will not change:** enable Manage Roles, put the bot above all rank roles, and ensure it is above the target member.
- **Updates stop:** check `$status`, `$resume`, and `$sync`. The board channel needs Attach Files and Embed Links in addition to message permissions.
- **Settings disappear after deployment:** attach the `/data` volume and set `DATA_DIR=/data`.
- **Posts duplicate:** run only one bot instance; stop your local copy before running it on Railway.
- **A new server ignores commands:** invite the bot there and run `$addserver <id>` from the home server first. Then check that server’s prefix.
- **Evaluator commands are denied:** an administrator in that server needs to run `$addevaluator @member`. Access is local to each server.
