# Design prompt: Freshroots Reorder Desk, v2 ("Fresh produce, smarter planning")

*Written by Claude, for Claude, from Shreya's references: 2 Pinterest animations + 9 images in `Downloads/Inspiration`. Build every screen from this brief. Do not fall back to the old dark instrument-panel look.*

---

## 0. The prompt

> Redesign the Freshroots Reorder Desk as a light, organic, produce-market app. It should feel like a premium food or wellness app, not an ERP. Use generous white cards on a warm sage-white canvas, deep forest green for weight and action, a pale lime for "selected" and "good", and a single hot orange for urgency.
>
> Every screen has one hero number and one primary pill button. Data shows as rounded objects: rings, capsule bars, tick gauges, a ruler dial. Motion comes from the two reference animations: cards glide in on load, gauges sweep, numbers count up, the quantity dial scrolls and snaps, and the detail opens as a sheet.
>
> Keep every feature and every rule of the current desk:
> - the 5 rules
> - the human gate
> - a note on every edit or rejection
> - locking after hand-off
>
> Add Zoho orders and Gemini-written reasons.

---

## 1. What each reference contributes

| Ref | What it shows | Take | Apply to |
|---|---|---|---|
| **Pin 1**: calorie app animation (green phones, "Carbonara 384 kcal") | Lime-olive canvas, white phone cards, big bold dish title, macro rows with coloured dots, a **horizontal ruler scroller** (212 213 **214** 215) with a centre needle, a half-arc gauge beside the plate, a dark **"Done" pill**, a round black → button, and meal cards **stacked in tiers** (lime → yellow → lavender). Motion: phones slide diagonally, the ruler scrubs and snaps, the arc fills. | Ruler dial · arc gauge · stacked tier cards · dark full-width pill · diagonal glide-in | **Quantity editor = ruler dial** (snaps to 10 units, the needle shows the value). Status groups = **stacked tier cards** on Home. "Approve" = dark pill. |
| **Pin 2**: AI nutrition tracking (Dribbble 14550297) | Sage canvas, mint header band, **ring gauge with orange gradient** and a big number in the centre ("1658 kcal left"), eaten/burned stats either side, 3 thin macro bars, "Daily" meal cards with 3D food art, a **floating bottom tab bar with a centre orange + FAB** | Ring with flanking stats · thin progress bars · floating tab pill · centre FAB | Home hero: **ring = decided / to decide**, flanked by "reorder now" and "pause" counts. Bottom **floating nav pill**, with the centre FAB = **Run planner**. |
| `46d2…` AgroAI | Forest-green + mint, a **map of hatched fields** with dashed borders, **segmented tabs** (Overview · Analysis · Notes · Schedule) with a forest pill on the active one, **4 round metric chips** (icon in a forest circle + label + value), a photo card with a round ↗ button, a **growth bar chart of thin vertical bars getting greener** (Apr→May), and W·M·Y toggles | Segmented pill tabs · icon-circle metric chips · gradient thin-bar chart · round ↗ | SKU sheet tabs: **Overview · Trend · Rules · Notes**. Metric chips: On hand · Demand/wk · Cover · Std qty. **16-week sales = thin bars greening toward the last 4 weeks.** |
| `6f98…` Farm2Table | Strong green, product tiles on tinted squares, cart rows with ± steppers, an **order timeline** (Placed ✓ → Pending ✓ → Confirmed ✓ → Processing ○ → Delivered ○), My Orders filter pills (All · Pending · Processing) and status chips | Order timeline · filter pills · status chips | **Orders screen**: each hand-off is an order with a timeline: Planned → Decided → Sent → Draft PO in Zoho → Issued in Zoho. |
| `7725…` Green veggie | Deep olive with mint cards, **pill tab bar with an active forest circle**, "Eat Fresh / Live Healthy" headline on a photo, search pill + ✦ AI button, **"AI Personalized Picks"**, the promo row "You're about to get rewarded" | ✦ AI button · AI picks row · reward/info banner | **✦ Gemini** button and an "AI notes" section. The banner style is used for "Zoho not connected" and "Festival month +25%". |
| `9240…` + colour sheet | Palette **#030303 · #DDEFB5 · #F3F3F5**, "Let's Track Your Progress" headline, lime card with a ring + flame, 3 mini stat cards each with a coloured bar, meal rows with an avatar cluster and a + button, a **lime centre nav button**, Protein/Fat/Carbs rings, black "Add Meal" pill next to an outline "Update Details" pill | Palette · mini stat cards with colour bars · paired outline + black pills | Base palette. Stat cards on Home. Action pair: outline "Edit qty" + black "Approve". |
| `dadf…` FitBite | "Your Daily Guide to Smarter Eating" in a big sans with an inline icon, **week date strip** (S M T **W** T F S with a lime pill on today), Statistic bar chart (Mon–Sun capsule bars with % labels, the selected one solid lime), exercise/BPM mini cards | Week strip · capsule bar chart with % labels | **Run calendar strip** (Mon/Thu run days marked). Insights: weekly capsule bars. |
| `deee…` Medical | Sage glass cards, big numerals (7.3 / 3.6), a **bar chart with a dashed average line and a highlighted bar**, round dark → buttons on each row, the **range slider in a lime capsule**, chip clouds (some dark-filled), "Your plan is almost done 67%" with a **hatched remaining segment** | Dashed average line · hatched remainder · dark round → · chip cloud | Trend chart: dashed **12-wk avg** line. Progress bar: **solid decided + hatched remaining**. Row affordance: dark round → |
| `ece0…` Fitness | Dark-green hero card with a **lime arc** and "86%", "Continue" lime pill, icon category row, **tick-segment gauge** (86% completed), "+15%" chip, line chart with a highlighted **vertical capsule on the selected day**, underline tab bar | Tick gauge · lime-on-forest hero card · selected-day capsule | **Forest hero card** on Home: "Thursday run · 22 Oct" with a lime arc. Cover gauge = tick segments. |
| `ed7b…` Union | Painted grass-green squares, a single orange object in each, a calm serif-ish label ("Integration", "Optimization", "Governance", "Orchestration") | Orange as the *only* hot colour · conceptual empty-state illustrations | Empty states and the Connections screen: a calm green field + one orange marker. |
| `f7e7…` Fresh produce | Warm white canvas, **serif display headline with an italic third line** ("Fresh produce. Smarter business. *Better results.*"), a forest revenue card with a lime line chart, lime/beige stat tiles with mini bars, product rows (photo tile + name + "Organic • Bunch" + price + **lime + circle**), a hamburger/avatar header, a filter pill row (All · Fruits · Vegetables), "Today's pick" card | Serif + sans pairing · product rows · lime + circle · greeting header | **Greeting header** ("Good morning, Raghav"). Headline: "Fresh stock. Smarter orders. *Fewer stockouts.*" **SKU rows = product rows** (illustrated tile · name · "Beverage • 200ml" · qty · lime action circle). |

---

## 2. Design system

### Colour tokens (light theme only; the references are all light)
```
--canvas      #F3F4EE   page (sage-tinted white)
--card        #FFFFFF   cards
--sage        #E8EFDF   soft panels, inactive chips, tracks
--sage-2      #D5E3C6   borders on sage, chart tracks
--forest      #143D26   primary dark: hero card, primary pill, active tab
--forest-2    #1F5A37   hover on forest, chart strokes
--lime        #DDEFB5   selected / approved / "good" fill
--lime-2      #B9DC5C   bars, arcs, progress on forest
--ink         #0B130E   text (≈ #030303 softened)
--ink-2       #4E5A50   secondary text
--ink-3       #8A948B   meta, units, axis
--orange      #F26A21   the ONLY hot colour: reorder now, FAB, alerts
--orange-2    #FFB287   orange gradient end, soft orange fill
--lavender    #DCD6F4   pause (from the Pin 1 tier cards)
--butter      #F5E7A1   exception / needs your call (Pin 1 yellow tier)
```
**Status mapping (colour + glyph, never colour alone):**
- Reorder now = orange + ↑
- Reorder = lime-2 + ↗
- Pause = lavender + ‖
- In window = sage + ✓
- Your call = butter + ?
- Held = hatched grey + !

### Typography
- **Display:** *Instrument Serif* 400 (with italic) for page headlines and hero numbers' captions, e.g. "Fresh stock. Smarter orders. *Fewer stockouts.*" Use it sparingly: one headline per screen.
- **UI:** *Geist* 400/500/600 for everything else.
- **Numbers:** *Geist Mono* with tabular figures, for every quantity, week and %.
- **Scale:** 12 / 13 / 15 / 18 / 24 / 32 / 44 / 56. Hero numbers are 44–56 Geist 600 with the unit in 13 ink-3 (e.g. `1,820 units`).

### Shape, space, elevation
- **Radius:** cards 28 · inner tiles 20 · chips and pills 999 · round buttons 999 (40/48/56).
- **Spacing:** 8-pt grid. Card padding 20–24. Gap 16.
- **Shadow:** `0 1px 2px rgba(20,61,38,.06), 0 8px 24px rgba(20,61,38,.06)`. No borders on white cards; sage borders only on sage.
- **Hatch pattern** (`repeating-linear-gradient(135deg, sage-2 0 2px, transparent 2px 6px)`) for "remaining / unknown / held".

### Components
| Component | Spec |
|---|---|
| **Greeting header** | Avatar circle (initial) · "Good morning," small + name 18/600 · round icon buttons right (calendar, bell → integrations) |
| **Forest hero card** | Forest fill, lime arc gauge right, label chip ("Thursday run"), big number, "Continue" lime pill |
| **Ring gauge** | 12px stroke, rounded caps, orange→orange-2 gradient on a sage track, centre number + caption, flanking stats left/right (Pin 2) |
| **Tick gauge** | 24 ticks on a 240° arc; filled ticks lime-2→forest; centre % (Fitness ref) |
| **Stacked tier cards** | 3–4 overlapping cards (−24px overlap), each a status colour, title + count + chevron; tap to filter (Pin 1) |
| **Product row** (SKU) | 64px illustrated tile on a tinted square · name 15/600 · meta "Beverage • 200ml • NutriFlow" · right: qty mono + status chip + lime round action (+ / ✓) |
| **Runway capsule** | Sage track, hatched window band between min and max, fill in the status colour, value pill riding the end |
| **Ruler dial** | Horizontal scroll strip of ticks (every 10 units, major every 50), centre needle, big mono value above, snaps; ± round buttons either side; keyboard ←/→ (Pin 1) |
| **Segmented tabs** | Sage track pill; active = forest pill with white text; the indicator slides (AgroAI) |
| **Metric chip** | White tile, forest icon circle top, label 12, value 18 mono (AgroAI) |
| **Thin bar chart** | 16 thin rounded bars; colour ramps sage → lime-2 → forest toward recent weeks; dashed 12-wk avg line; selected bar gets a value bubble (AgroAI + Medical) |
| **Pills** | Primary = forest (or black) filled 48h · secondary = outline 1.5px forest · AI = lime with ✦ · danger = orange outline → filled on hover |
| **Order timeline** | Vertical; done = forest ✓ circle, current = orange ring pulsing, next = hollow; time on the left (Farm2Table) |
| **Floating nav** | Bottom-centre white pill, 4 icons + labels, active = forest dot/pill; centre **orange FAB 64px** "Run" with + (Pin 2 / FitBite) |
| **Banner** | Lime or butter rounded strip with an icon circle + one sentence + an inline action ("Connect Zoho") |
| **Sheet** | SKU detail: a right-side panel on ≥1100px, a bottom sheet with a grabber on mobile |

### Illustrations
Draw **simple flat SVG product tiles per category** (no photos, no emoji):
- Beverage = bottle
- Snack = cookie/bar
- Staple = grain sack
- Dairy Alt = carton
- Condiment = jar

Each sits on a tinted square (lime, butter, sage, lavender). The empty state is a painted-green field with one small orange dot (Union).

---

## 3. Motion (from the two animations)
1. **Load glide**: cards rise 16px and fade in, staggered 50ms, 420ms ease-out (Pin 1 phones gliding).
2. **Gauge sweep**: ring and tick gauges fill from 0 over 900ms cubic-bezier(.2,.8,.2,1); centre numbers **count up** in sync.
3. **Bars grow**: thin bars scale up from the baseline, staggered 25ms.
4. **Ruler scrub**: the dial uses native horizontal scroll with `scroll-snap`; the value updates live; the needle bounces 2px on snap.
5. **Sheet**: the detail slides in (x: 24px → 0 desktop, y: 100% → 0 mobile), 320ms.
6. **Approve**: the row's action circle fills lime with ✓ (scale .6 → 1), then the row slides left and collapses; the ring ticks forward.
7. **Tab indicator** slides between tabs (transform), 250ms.
8. **FAB**: press scale .94; while running, the + rotates into a spinner.
9. **Reduced motion**: everything appears in its final state.

---

## 4. Screens

**A. Home**
```
[ Greeting: (R) Good morning, Raghav            [cal] [bell] ]
[ Serif headline: Fresh stock. Smarter orders. Fewer stockouts. ]
[ Forest hero card: "Thursday run · 22 Oct" · 7 to decide · lime arc 0% · [Continue →] ]
[ Ring: Reorder now 5 | (2/7 decided) | Pause 2 ]   [ 3 mini stat cards: Units to order · Shortest runway · Festival +25% ]
[ Stacked tier cards: Reorder now 5 / Pause 2 / In window 8 ]
[ Week strip: run days Mon/Thu marked ]   [ Banner: Zoho / Gemini status ]
```
**B. Queue (decide)**: filter pills (All · Reorder now · Pause · In window), product rows, and the SKU sheet:
```
[ tile · name · meta ]   segmented: Overview | Trend | Rules | Notes
Overview: AI reason card (✦ Gemini, or "Rule template") · runway capsule · 4 metric chips
          ruler dial (when editing) · [Edit qty (outline)] [Approve 750 units (forest)] [Reject (orange outline)]
Trend: thin bar chart W27–W42, dashed avg, festival line
Rules: R1–R5 as rows with pass/fail icon circles
Notes: decision log (who, when, note)
```
**C. Orders**: hand-off card (lines, units, distributor groups) → **[Send to procurement]**. Then order cards with timelines: Sent → Draft POs in Zoho (with PO numbers) → Issued. Buttons: Download CSV · **Create draft POs in Zoho**.

**D. Insights**: weekly sales capsule bars per category, top-moving SKUs (product rows with ↗/↘ %), cover distribution.

**E. Connections** (bell): Neon · Zoho Inventory · Gemini · Vercel Cron, each a card with a status chip, what it does, and a test button.

---

## 5. Acceptance checklist
- [ ] Only light theme; every colour comes from §2 tokens; orange appears only for urgency or the FAB.
- [ ] One serif headline per screen; all numbers are Geist Mono tabular.
- [ ] Every status has colour + glyph + word.
- [ ] Quantity editing uses the ruler dial and still requires a note when the quantity changes.
- [ ] All 9 motion rules are implemented and switched off under reduced motion.
- [ ] Works at 1440 × 900 (two columns, side sheet) and 390 wide (single column, bottom sheet, floating nav).
- [ ] No feature from v1 is lost: run, decide, undo, lock after send, CSV, name.
- [ ] Zoho and Gemini degrade gracefully: banners explain what's off and how to turn it on.
