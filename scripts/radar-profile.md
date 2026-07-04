# Radar profile — who these opportunities are for

Pablo — **17 years old**, based in **Colombia**, **sophomore (2nd-year) Computer Science**
undergraduate. Builds AI agents / software (MCP, LLM apps, indie products).

Goals (priority order): **internships** (early-career / sophomore, remote-friendly),
**study-abroad exchanges** from Colombia, **funding** (student / young-founder grants),
**growing social media**, **getting users** for his projects.

## Hard eligibility filter — apply strictly when scoring and deciding keep/drop

- **AGE 17 (minor).** Many programs require 18+. KEEP only if open to under-18 / 16+ /
  high-schoolers+undergrads / or with no stated age minimum. If it clearly requires "18+"
  or "must be of legal age", DROP — unless it's high-value AND its deadline/start is after
  he turns 18, in which case keep it LOW priority with an explicit age caveat in notes.
- **LOCATION Colombia / LatAm.** Two different in-person cases — do NOT conflate them:
  - **In-person IN Colombia** (Medellín, Bogotá, Cali, Barranquilla, or anywhere he can
    reach domestically) is **HIGH value — treat it like remote**: he lives there and can
    just show up. KEEP these and score them high; never down-rank them for being
    "in-person". Local hackathons/meetups/competitions are exactly what he's asking for.
  - **In-person US/EU / elsewhere abroad** is OK ONLY if participation can be remote, OR
    travel+visa are provided/sponsored, OR no relocation is required.
  Otherwise prefer remote / online / worldwide-eligible. DROP anything requiring US work
  authorization, US/EU citizenship, or residency he doesn't have. Spanish-language and
  LatAm-regional programs are a plus. Set `modality`/`location` accurately so a Bogotá
  hackathon reads as in-person · Bogotá, not remote.
- **STATUS undergraduate sophomore.** KEEP undergrad-eligible items. DROP graduate / PhD /
  postdoc-only, "final-year / senior only", "recent graduate only", and roles requiring
  years of professional experience.

## Scoring guidance

- **leverageScore 5** = remote/global (or LatAm-eligible), open to a 17-year-old undergrad,
  and directly advances a goal — e.g. a remote paid internship open to under-18, a global
  online hackathon with a prize, a founder grant with no age barrier, an exchange
  scholarship for LatAm undergrads. **A hackathon/competition physically in Colombia
  (Medellín/Bogotá) is also leverageScore 5** — attendable, high-signal, and networking-rich.
- Lower the score for eligibility friction (age gate near 18, visa/relocation, degree level).
- Whenever there's an age / visa / degree question, ADD a short caveat to `notes`
  (e.g. "Check: appears to require 18+" or "Verify LatAm eligibility").

## Worthiness bar (quality over volume)

Prefer 15-45 genuinely strong records over a padded list. Keep an **in-person / travel**
opportunity only if it clears ONE of: (1) fully-paid / travel-covered, (2) prize or funding
≥ ~US$3,000 (net-positive after ~US$500-900 flights from Colombia), or (3) elite prestige
(YC, Thiel, Emergent Ventures, Hult Prize global, ETHGlobal majors, etc.). **Remote / online
/ grant** opportunities have zero travel cost, so keep them if there is ANY real prize,
funding, credential, or strong prestige — drop only exposure-only, pay-to-enter, or vanity
items. A hackathon/competition physically in Colombia is exempt from the travel test (he can
just show up) — keep and score it high.

## Timing classes (never drop a good program just because it has no deadline)

Classify each kept item into one of three timing classes and set fields accordingly:
- **Open-now** — applications open with a future deadline. Set `deadline`; `priority` "high"
  if ≤ ~14 days.
- **Rolling / evergreen** — no deadline, apply anytime (many of the best young-founder
  grants/fellowships). Set `rolling: true`, `deadline: null`. A rolling program is NEVER
  "expired" — do not drop it for lacking a deadline.
- **Plan-ahead** — a recurring flagship or a window that opens later within ~12 months. Keep
  it with `rolling: false`, `deadline: null`, and a `notes` line stating the expected timing;
  label any inferred date `[estimated]`. Never invent a date, prize, or URL.

## AI-FIT priority

Pablo builds AI agents / dev-tools / LLM apps — that is his edge. When an opportunity is
squarely AI / dev-tools / developer-productivity / founder-relevant, add an `"ai-fit"` tag and
lean the `leverageScore` up by ~1 (do NOT exclude non-AI opportunities — general business,
social-impact, science, leadership and youth programs still count if they clear the bar).

## Local Colombia ecosystem — recognize and up-rank

If a scraped hit is a real competition/convocatoria/demo-day/accelerator open-call run by one
of these local hosts, treat it as HIGH value (in-person Colombia = attendable) and score it
4-5, `modality` "in-person", `eligibility` "latam": **Ruta N, Parque del Emprendimiento
(Parque E), Créame, Comfama, Wayra, Rockstart, iNNpulsa**, and the university entrepreneurship
centers **EAFIT, UPB, Universidad de Antioquia (UdeA)**. Valle de Aburrá (Medellín metro) ranks
first, then Bogotá, then rest-of-Colombia. Drop pure meetups / mixers / talks / fairs with no
competition, selection, or prize.

## Curated seed (context — don't duplicate)

A separate curated seed (`scripts/radar-seed.json`, merged deterministically at ingest) already
carries the standing evergreen grants/fellowships (Emergent Ventures, Z Fellows, 1517, Thiel,
EF, South Park Commons, Neo), the recurring plan-ahead flagships (Y Combinator, a16z Speedrun,
ETHGlobal, Microsoft Imagine Cup, Hult Prize, MLH, Slush 100), and local organizers (Ruta N,
Wayra). You do NOT need to reconstruct those from the feed — focus on FRESH, still-open finds in
the scraped data. If the data does surface one of them with a concrete new deadline/edition,
still emit it (the ingest dedupes by apply-URL + title, so a better/more-specific record is fine).
