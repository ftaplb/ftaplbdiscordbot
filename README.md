# FTAP Discord leaderboard

A Discord leaderboard for Fling Things and People. The board displays **# · Player · Rank · Region · Device**, updates when members' roles change, and reuses its existing messages after a restart.

## Discord setup

Enable **Server Members Intent** and **Message Content Intent** in the Discord Developer Portal. Invite the bot with View Channel, Send Messages, Embed Links, Attach Files, Read Message History, and Manage Roles. Put its bot role above the rank roles it needs to assign.

The home server is `1502470371826204772`. Its initial staff roles are `1541427910198427809` and `1538609206763061308`. An administrator can bootstrap individual staff access:

```text
$staff add @member
$staffrole add @role
$setchannel #leaderboard
$help
```

Staff can manage the board, editor/evaluator access, individual staff, staff roles, custom rank roles, and tracked region/device roles directly in Discord. Administrators can also manage access/configuration/recovery without first having a staff role. Home-server administrators alone can enable additional servers with `$addserver <server ID>`; each server has independent settings and data.

```text
$editor add @member
$editor remove @member
$evaluator add @member
$evaluator remove @member
$editors
$evaluators
$staffroles
$staff remove @member
$staffrole remove @role
$addsetrank @role
$setrank @member @role
$regionrole Europe @role
$devicerole Mobile @role
```

Evaluators can assign/remove approved rank roles. Editors can additionally promote/demote. They cannot approve new roles or grant staff access. Custom ranks are added below the original 12 tiers. Assigning a rank replaces the member's other configured rank roles; unrelated roles remain. `$removesetrank @role` removes a custom tier from the configuration without changing members' existing roles.

Region and Device automatically follow the supplied home-server role IDs. `$regions` and `$devices` show all mappings. Missing values display `—`; members with multiple matching roles show all matching labels separated by `/`. Mappings can be changed or disabled with commands, without deployment. The removed Rating, RD, Country, and Clan fields no longer appear on the board/profile/CSV; previously saved statistics remain in storage for compatibility.

See [COMMANDS.md](COMMANDS.md) for every command and its access requirements.

## Railway: keep settings across redeploys

**A persistent volume is required. A directory in the deployment container alone does not survive redeployment.**

1. Attach a Railway volume to the bot service and mount it at `/data`.
2. Remove `DATA_DIR` to let the bot use Railway's automatically supplied `RAILWAY_VOLUME_MOUNT_PATH`, or set `DATA_DIR=/data` explicitly. If an existing volume already contains this bot's data, keep using its existing data directory.
3. Set `DISCORD_TOKEN` in Railway Variables. Use one running instance against this volume.
4. Deploy this revision, then run `$storage` to verify that the bot reports a Railway volume.

These changes need one deployment. Subsequent channel, access, title, prefix, tracked-role, and custom-rank changes can be made through Discord commands. Code changes still require deployment.

The bot immediately saves channels, message IDs, access lists, prefixes, player overrides, role mappings, settings, order, history, undo/redo, and the enabled-server registry to the data directory. On restart it reloads the selected channels and edits the saved board messages. It warns in logs and `$storage` if a Railway data directory is outside the attached volume.

**Before replacing an older deployment without a volume**, download its `$backup` and record its `$settings`, staff roles, editors, and evaluators. Older backups omit channels and access lists, so these cannot be recovered from the old backup alone. Existing ephemeral files from a stopped deployment cannot be recovered by code in the replacement deployment. If the old deployment already uses a volume, preserve its mount/path so the existing data migrates automatically.

Railway reference: [Using volumes](https://docs.railway.com/volumes).

## Backups and recovery

`$backup` saves and downloads a version 2 recovery file containing all board/player settings plus channels, message IDs, prefixes, access lists, and role mappings. Keep backup downloads in a staff-only channel. Daily local snapshots are made when data is saved, retaining the latest 30. Local snapshots require the same persistent volume as the live data.

- `$backups` lists local backup IDs.
- `$restore <ID>` restores board/player data while keeping current channel/access/prefix choices. Legacy version 1 local backups are supported. Undo/redo also preserve those choices.
- `$restoreconfig <ID>` restores the complete configuration from a local version 2 backup.
- `$importbackup` with an attached version 2 JSON file restores a downloaded configuration after lost storage. Version 2 backups must belong to the current server. Legacy version 1 downloads restore board/player data only and keep current channels, access, and prefix. A pre-recovery backup is saved and undo/redo is cleared. Recovery does not change members' Discord roles.

Per-server state and backups live in `servers/<guild ID>/`; enabled-server authorization lives in `servers.json`. Old single-server `state.json` and backups are copied into the home-server directory without deleting the originals.

## Local development

Use Node.js 22 or later (Docker and CI use Node 24).

```sh
npm ci
cp .env.example .env
# Fill in DISCORD_TOKEN in .env.
npm start
```

```sh
npm run check
npm test
npm run preview
node scripts/docs.js
```

The preview uses sample players only; it never changes live Discord data. No bot token or production state is stored in this repository.
