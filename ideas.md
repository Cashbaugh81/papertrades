# Design brief — "Ledger"

## Direction
**Warm ledger.** A personal set of books, not a trading terminal. The feeling: quiet,
paper-like, precise — the opposite of the neon-and-tickers aesthetic every other
broker ships. You open it after the close, in the evening, and read it like a statement.

## Why this direction
The dominant job is **Operate**: check after the close, compare, occasionally trade.
Operational surfaces should keep compared information close and stay calm under
repeated use. A dark "terminal" would signal adrenaline; this product's whole thesis
is the opposite — see your urges, choose the boring thing. The interface should feel
like a ledger because the product is a ledger.

## Principles
1. **Numbers are the content.** Type, alignment and tabular figures carry the design.
   No decoration that competes with a value.
2. **Rules, not boxes.** Hairline horizontal rules group rows; cards are reserved
   for the one interactive region (the trade ticket). Avoid nested cards entirely.
3. **The window is always visible.** Every performance figure sits beside the date
   range it was measured over. A number without its window is a lie by omission.
4. **Red and green are meaning, never mood.** Muted, used only on deltas. Everything
   structural stays ink or paper.

## Colour
| Role | Hex | Use |
|---|---|---|
| Paper | `#FAF7F1` | page background |
| Surface | `#FFFFFF` | chart plot, trade ticket |
| Ink | `#16191D` | primary text, rules at 10% |
| Muted | `#6E6862` | labels, secondary figures |
| Rule | `#E4DCCE` | hairlines, table dividers |
| Accent | `#1F4D3D` | primary action, selected state, wordmark rule |
| Gain | `#1B6B4A` | positive delta only |
| Loss | `#A03A28` | negative delta only |
| Flag | `#8A5A12` | data-staleness notice |

## Type
- **Display / big figures:** `ui-serif, Georgia` — the ledger voice. Used for the
  wordmark, the three headline figures, and portfolio names in the detail view.
- **Body / labels / tables:** system sans (`ui-sans-serif, system-ui`).
- **Every number** gets `font-variant-numeric: tabular-nums` and right alignment.
- Scale: 11px micro-label (uppercase, 0.08em tracking), 13px table, 15px body,
  22px section head, 34px headline figure, 44px hero.
- Headings use tight tracking (-0.01em); labels use wide tracking.

## Layout
Single column, `max-width: 1080px`, 32px gutters, 8px spacing rhythm.
- **Top bar:** wordmark left; as-of date + market status centre-right; account right.
  Sticky, paper background, hairline bottom.
- **Comparison view:** headline figures row → parallel-path chart → spread table.
- **Detail view:** portfolio header with figures → holdings table → trade ticket
  (the only card) → decision log.
- Mobile: single column, tables become stacked rows with the label inline.

## Signature elements
1. **Parallel paths** — one line per portfolio on a shared axis, with the band between
   best and worst washed in accent at 6%. This is the product's core image: the same
   dollars taking different paths.
2. **The spread bar** — in the comparison table, a short horizontal bar showing each
   portfolio's distance from the baseline, drawn from a centre line. Direction and
   magnitude read before the number does.
3. **The decision log** — trades as a dated list of human decisions with the price
   paid, deliberately formatted like a bank statement rather than a "positions" panel.
   The point is to see your urges as a record, not to admire your holdings.

## Motion
- Hover / focus: 160ms `ease-out` (background, border, colour).
- Press: 90ms, translateY(1px).
- Lines draw once on mount over 620ms `cubic-bezier(0.22,1,0.36,1)`, left to right.
- No looping or ambient animation anywhere; nothing moves without the user acting.
