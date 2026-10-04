# FTAP leaderboard bot

A Discord leaderboard for **Fling Things and People**, built with JavaScript, discord.js, and generated PNG cards.

The bot works only in server `1502470371826204772`. It watches the 12 game rank roles, sorts them from Fling God to Casual, and edits its existing leaderboard posts when ranks change. Rank changes are grouped over a three-second window to keep updates tidy. A full member sync runs every two minutes by default to catch missed events.

## Discord setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) in Brave. Create an application, then open **Bot**.
2. Enable **Server Members Intent** and **Message Content Intent**. These are required for rank tracking and `$` commands. See [Discord's intent documentation](https://docs.discord.com/developers/events/gateway#privileged-intents).
3. Copy the bot token into Railway's `DISCORD_TOKEN` variable, or your local `.env` file. Keep it out of GitHub.
4. In **OAuth2 → URL Generator**, select the `bot` scope. Select **View Channels**, **Send Messages**, **Embed Links**, **Attach Files**, and **Read Message History**. Also select **Manage Roles** if you want `$rank`, `$promote`, `$demote`, or `$add @member <rank>` to assign roles.
5. Open the generated invite URL and add the bot to the specified server. Put its role above the 12 game rank roles if it will assign ranks. The bot itself does not need Administrator.

## Railway

1. Create a Railway project and choose **Deploy from GitHub repo** → `ftaplb/ftaplbdiscordbot`.
2. Add a persistent **Volume** to the bot service and mount it at `/data`.
3. In the service's **Variables**, set:

   ```text
   DISCORD_TOKEN=your_actual_bot_token
   DATA_DIR=/data
   ```

4. Deploy. `railway.json` selects the Dockerfile and a restart-on-failure policy. The image includes Node 24 and the fonts used by the leaderboard cards.
5. Keep a single running instance. This bot uses one local JSON database. The service needs to stay running; leave serverless/sleeping mode off.
6. In deployment logs, look for `Connected as ...`. In Discord, run `$help`, then have an administrator run `$setchannel <channel ID>`.

The bot uses a Discord gateway connection and does not need a public domain or HTTP healthcheck. The volume keeps settings, player profiles, backups, and message IDs across deployments. Railway volumes attach at runtime; they are configured in the dashboard, not by `railway.json`. [Volume reference](https://docs.railway.com/volumes/reference) · [Deployment configuration](https://docs.railway.com/config-as-code/reference).

## First commands

```text
$setchannel 123456789012345678
$participants 100
$ranks
$roblox @member speedproaso
$rename @member Chamo
$move @member 1
$preview
```

Replace the sample channel ID with your actual channel ID. Enable Developer Mode in Discord, then right-click the channel and copy its ID. Mentions above are actual Discord member mentions, not typed display names. Rank names can contain spaces; quotes are optional:

```text
$rank @member Expert II
$rankrole Advanced I 123456789012345678
```

The board automatically finds roles with these exact names, in this fixed order:

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

`$participants 1–100` sets the display limit. For example, if the limit is 100 and 32 members have rank roles, the board shows 32 actual participants. It never fills empty places with made-up players. Everyone with an eligible role remains available in `$members` and `$export`, even if they fall below the display limit.

By default, ties within a rank use a saved manual order, then alphabetical order. `$move` and `$swap` change positions **within the same rank**. `$sort score` and `$sort wins` also sort within ranks; a lower rank never overtakes a higher one.

Roblox usernames, scores, wins, and losses are entered by staff. This bot does not read Roblox game statistics or verify ownership of Roblox accounts.

## Command access

- **Everyone:** `$help`, including `$help command` and `$help category`.
- **Administrator permission:** `$setchannel <id>`. Holding a staff role alone does not grant this command.
- **One of these roles:** `1541427910198427809` or `1538609206763061308` — `$participants` and the 50 extra commands in [COMMANDS.md](COMMANDS.md).

Administrators without either listed staff role cannot use staff commands. These rules are checked against freshly fetched membership on every command. Commands in other servers or DMs are ignored. The bot suppresses mentions in replies and board updates.

Rank assignment commands can only assign the mapped game rank roles. Staff, managed, or privileged roles cannot be assigned as game ranks. Discord still requires the bot's role to be high enough to manage the target member.

## Saved data and recovery

Data is stored under `DATA_DIR`, or `./data` locally. `state.json` is replaced atomically after each change, and leaderboard message IDs are saved after each successful post. On restart, the bot fetches the full member list before publishing and reuses the saved posts. If a board post is deleted, it is recreated during an update. Lowering the participant limit removes surplus board pages.

`$backup` saves a local snapshot and sends a downloadable JSON copy. `$backups` lists saved IDs; `$restore <ID>` restores one. The newest 30 backups, 50 undo changes, and 200 history entries are retained. Downloaded backup copies are for safekeeping; `$restore` reads a local saved backup ID, not an uploaded attachment.

`$undo`, `$redo`, and `$restore` affect saved settings and player profiles. They do not change Discord roles or the administrator's selected leaderboard channel. To reverse a role assignment, use `$rank` again. `$remove` hides a player and clears their profile; `$exclude` hides them while keeping that profile. `$include` allows them back if they have an eligible rank role.

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

The preview command writes `preview.png` using sample names from the reference screenshot. It never adds these samples to the live server. Tests run without a Discord token and cover access controls, role-based ranking, updates, data recovery, and rendering. Live Discord operation still needs the token, enabled intents, and server permissions. The Dockerfile needs a Docker-capable environment to build.

## Common fixes

- **The bot is offline:** check the token and both privileged intents, then read the Railway deployment logs.
- **Commands are ignored:** use a server text channel, check Message Content Intent, and give the bot access to that channel.
- **The board is empty:** run `$ranks`; missing or ambiguous roles need `$rankrole` bindings. Check Server Members Intent.
- **Roles will not change:** enable Manage Roles, put the bot above all rank roles, and ensure it is above the target member.
- **Updates stop:** check `$status`, `$resume`, and `$sync`. The board channel needs Attach Files and Embed Links in addition to message permissions.
- **Settings disappear after deployment:** attach the `/data` volume and set `DATA_DIR=/data`.
- **Posts duplicate:** run only one bot instance; stop your local copy before running it on Railway.
