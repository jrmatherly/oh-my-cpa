# Style

How a sentence in the catalog reads. These rules describe the copy that is already there, so a
reviewer can tell a mistake from a choice, and so a new sentence looks like the ones beside it.

## Voice

Second person, addressed to the operator who runs the deployment. The console says what a screen
does and what a control changes. It does not congratulate, apologise, or explain itself.

Use sentence case. A label, tooltip or button has no trailing period. A full sentence that
explains a consequence keeps its period.

## What a sentence may contain

- **A placeholder, a unit, or a proper noun.** Nothing else that is not words. An id, a JSON field
  name, or a raw HTTP status in the middle of a sentence belongs in a code span beside it, not in
  the sentence.
- **Each placeholder exactly once.** A sentence that drops `{n}` silently loses the number.
- **An ICU plural wherever a count changes the noun.** English takes `one` and `other`:
  `{n, plural, one {# key} other {# keys}}`. Every plural keeps `other`.
- **No leading or trailing whitespace**, and no double space. The layout owns spacing.
- **No middle dot (`·`) between parts.** A catalog sentence relates its parts in words, a
  comma or parentheses: `Page {page} of {n} records`, `Auto ({model})`, `Cache write (5 min)`. Two
  facts that are not one phrase are two catalog entries the layout sets apart (`MetaLine`, a
  tooltip card). `pnpm check:feedback` refuses the dot in the catalog too.

## Names of things

A surface is named once and keeps that name: the same word for the page title, the menu entry, the
breadcrumb and the empty state. `GLOSSARY.md` is where the name for a concept is decided. This file
is only about how a sentence around it is written.

## Errors

An error sentence says what happened and, where the operator can act, what to do. It never shows a
stack, an exception type, or an upstream's raw body as the sentence. Those are quoted underneath,
in a code frame. A refused action names the rule it broke:

> This backup comes from an older version and cannot be restored directly.

rather than "Operation failed".

## Length

A label has one line. When a sentence does not fit in a control, the answer is a shorter sentence,
not a wider control: the mobile console renders the same catalog. A tooltip may hold the longer
explanation, and that is where a caveat belongs. A tooltip never repeats the control's own label or
explains how to press it ("Click to filter"). See `docs/dev/design.md`, Tooltips.

## Subtitles, hints, and secondary copy (Captions)

Secondary copy (form field hints, card subtitles, section descriptions, table footers) exists to help
the operator act with clarity and confidence. It supports the interface quietly. It is not a legal
disclaimer, an architecture manual, or an agent safety cushion.

### Invariants for secondary copy

1. **User necessity over agent defense.** State what the field does, what format it accepts, or what
   its immediate effect is. Never write defensive disclaimers ("This does not lift every
   restriction", "Proceed with caution to avoid irreversible loss"), passive-aggressive warnings, or
   gateway version lectures ("This priority needs CPA v8.0.33 or later; upgrade older gateways
   before relying on credential overrides"). If an old gateway version is incompatible, enforce that
   through API or feature detection or validation, not by lecturing the user in the caption.
2. **Concise precision on real gotchas.** When a real hazard or subtle rule exists (data deletion,
   precedence over an upstream wildcard, a required restart), state it in a single, calm sentence.
   Do not explain why the system was designed this way.
3. **Typographic budget and visual rhythm.**
   - A hint is usually one concise sentence, and at most two short ones.
   - Keep a hint within about 100 characters.
   - Secondary copy never takes more height or attention than the control itself.
4. **No negative preemption and no defensive case enumeration.**
   - Do not write what something is *not* unless users regularly and dangerously mistake it for
     something destructive. "Clearing the list restores the provider's inherited rules" is complete;
     adding "this does not lift every restriction" is clutter. State positive ownership directly:
     "Path inside the CPA runtime" rather than "Not a path on the Oh My CPA host".
   - Do not enumerate obvious default or empty states ("When empty, X; when set, Y", "0 means
     default"). Let placeholders, control defaults and unit labels carry ordinary fallbacks. When a
     sentinel value has non-obvious meaning (`0` meaning "unlimited" rather than "zero"), convey it
     through the placeholder (`0 (unlimited)`) or a concise positive caption.
5. **Omission is preferred over redundancy.** If the label, placeholder, unit or picker options are
   already self-explanatory ("Port", "TLS certificate path", "Debug mode", "Enable connection
   pool"), omit the subtitle. Keep secondary copy only when it prevents real operator ambiguity.

### Bad and good examples

- **Bad (defensive and bloated):**
  > Separate model IDs with commas or new lines. A non-empty list replaces the provider's exclusion rules (including *). Clearing the list restores the provider's inherited rules and does not lift every restriction. This priority needs CPA v8.0.33 or later; upgrade older gateways before relying on credential overrides.
- **Good (direct and actionable):**
  > Separate model IDs with commas or new lines. A non-empty list replaces the provider's exclusion rules (including *), and clearing it restores the inherited rules.

- **Bad (defensive "not X" and filesystem trivia):**
  > A file path in the CPA runtime, not a path on the Oh My CPA host. Leave empty to use <auth-dir>/kv.db.
- **Good (positive identity, placeholder shows the default):**
  > Path inside the CPA runtime *(Placeholder: `<auth-dir>/kv.db`)*

- **Bad (empty-state enumeration and an operational command):**
  > Proxy IPs or CIDRs allowed to send forwarded client IP headers. When empty, forwarded headers are not trusted. Restart after changing.
- **Good (calm statement of capability with the required action):**
  > Proxy IPs or CIDRs allowed to send the real client IP header (applies after a gateway restart)

- **Bad (caption restating the label):**
  > Port: the TCP port the service listens on
- **Good (self-explanatory label, no subtitle):**
  > Port *(No subtitle needed)*

- **Bad (anxious disclaimer):**
  > Warning: this is a high-risk action that may invalidate existing authentication settings and affect production traffic. Back up your configuration before changing it.
- **Good (calm statement of consequence):**
  > Takes effect immediately; existing connections re-authenticate with the new settings.
