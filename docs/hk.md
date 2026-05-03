# HK Bot

The HK bot is a curated self-role assignment system modelled on HK-47 and the HK-unit line from
KOTOR. It presents roles as "designations" and communicates in HK's clipped, sentence-prefixed
register: efficient confirmations, dry mockery, and procedural clarity.

## Persona

HK units classify organics as targets, meatbags, and designations. The bot leans into that framing
without making the workflow confusing. Status responses use prefixes like **Statement:**,
**Observation:**, and **Mockery:** to signal type. Errors are stated plainly — the character voice
never obscures what went wrong.

Key voice notes:
- Sentence-prefix labels when the response type is ambiguous.
- Never so sardonic that the UX becomes opaque.
- "Designation assigned" and "Designation removed" feel intentional and theatrical.
- Permission failures are stated explicitly, not hidden behind jokes.

## Role Catalog

Roles are organized into four categories. All must be created in the guild with exactly matching
names before the bot can assign them.

### Projects

| Role name | Description |
|---|---|
| Modzilla | Opt into moderation and community-governance conversations |
| Toolset Enthusiast | Follow toolset usage, editor workflow, and discovery chatter |
| reone | Track reone engine discussions and adjacent technical work |
| kotor.js | Track browser and JavaScript-centric KOTOR work |
| andastra | Follow andastra project updates and discussion |
| Script Slicer | Follow scripting, reverse engineering, and runtime behavior threads |

### Community

| Role name | Description |
|---|---|
| Holocron Archivist | For documentation keepers, wiki editors, and lore gatherers |
| Ebon Hawk Crew | General community role for regulars who want social discovery and pings |

### Events

| Role name | Description |
|---|---|
| Watch Party | Get pinged for streams, showcases, and community viewing sessions |
| Release Watch | Get pinged for releases, patches, and important project updates |

### Sectors (Time Zone Groupings)

| Role name | Description |
|---|---|
| Core Worlds | Americas-heavy activity windows |
| Mid Rim | Europe and Africa-heavy activity windows |
| Outer Rim | Asia-Pacific-heavy activity windows |

## Commands

### `/designations panel`

Opens a private multi-select dropdown that lets the user pick all desired designations at once.
Deselecting a currently held role removes it. The selection is applied atomically when the user
submits.

**Permissions required:** none (any guild member).

---

### `/designations list`

Shows the full designation catalog organized by category, with descriptions and flavor text.

---

### `/designations assign`

Assigns one specific designation from the catalog.

**Options:**
| Option | Required | Description |
|---|---|---|
| `designation` | yes | Pick one role from the catalog |

---

### `/designations remove`

Removes one specific designation from the current member.

**Options:**
| Option | Required | Description |
|---|---|---|
| `designation` | yes | Pick one role to remove |

## Guild Setup Checklist

1. **Create the roles.** Every role name in the catalog above must exist in the guild with an exact
   match (case-sensitive). The bot will report a missing-role warning if a designation cannot be
   resolved.

2. **Set the HK bot role high enough.** In the guild's role list, the HK bot's role must sit above
   every role it is expected to manage. Discord's role hierarchy rules prevent a bot from modifying
   roles at or above its own.

3. **Enable Server Members Intent.** Required so the bot can fetch member objects to read and
   update their roles.

4. **Grant Manage Roles permission** to the HK bot application in the guild.

## Safety Rules

- Staff and moderation roles are not in the catalog and cannot be self-assigned through this bot.
- Role hierarchy failures are surfaced to the user with a **Mockery:** prefix stating which roles
  were blocked.
- Missing guild roles are surfaced with an **Observation:** prefix. The bot does not silently skip
  them.
- All role add and remove calls include an audit-log reason string (`HK designation sync for
  @user`).

## Response Format Examples

```
Statement: Assigned reone, Watch Party.
Observation: Missing guild roles for Script Slicer.
Mockery: Role hierarchy prevented access to Modzilla.
```

## Public user guide (wiki)

End-user and operator documentation for HK-86 (commands, reaction panels, roles) lives on the **[community bots wiki](https://github.com/OpenKotOR/community-bots/wiki/docs/guides/hk-86)** (not in this `docs/` tree).

## Current Limitations

- There are no persisted per-member designation presets yet. The sync panel reads live guild roles
  each time.
- The bot does not ping members on role change. Assignments are ephemeral replies.
- There is no admin command to bulk-add the required guild roles yet. A server admin must create
  them manually.
