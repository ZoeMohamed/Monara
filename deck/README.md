# Presentation deck assets

Source files for the images used in the FinTechathon 2026 presentation deck (Canva design `DAHXbpUo1CU`, titled "Monara_FinTechathon").

Each image is a small HTML page in `src/`, rendered to a transparent PNG in `png/` with headless Chrome, then uploaded to Canva and placed on a slide. Brand and partner logos live in `brand/`.

## Render

```sh
deck/render.sh              # every image
deck/render.sh hub arch     # only these
```

The script needs Google Chrome (set `CHROME` to override the path) and network access for the Poppins web font. Sizes and pixel ratios are in the `SPECS` table at the top of `render.sh`. Most images render at 2x. Full-bleed backgrounds and logo strips render at 1x.

## Images and slides

| Source | Canva slide |
|---|---|
| `cover-bg`, `cover-top` | 1 Cover (background and logo strip) |
| `hero` | 4 Product hero |
| `team` | 5 Team |
| `hub` | 6 How it works |
| `ph-panel` | 7 to 10 Planned screenshot placeholder |
| `arch` | 11 System architecture |
| `flows` | 12 Workflows |
| `tiers` | 13 Permission tiers |
| `competitor` | 14 Competitors |
| `waves` | 15 Market (expansion waves) |
| `s16-pricing`, `s16-c1`, `s16-outlook`, `s16-kpis`, `s16-bar-l`, `s16-bar-r` | 16 Business model |
| `gap` | 3 Research chart |
| `attack` | 18 Safety under attack |
| `risk` | 19 Privacy and operations risks |
| `card1` to `card4` | 2 Problem cards |
| `bg-plain`, `icon`, `icons`, `thanks-icons`, `conn` | Backgrounds, icons and connectors on several slides |

`png/qr_repo.png`, `png/qr_docs.png`, `png/icon_code.png` and `png/icon_doc.png` were produced separately (QR codes for the repository and `docs/tech`, and two icons for the Thank you slide). They have no HTML source.

## Putting an image on a slide

1. Render the PNG.
2. Ask the Canva MCP for an upload URL, then `curl -X POST -H "Content-Type: application/octet-stream" --data-binary @png/<name>.png "<uploadUrl>"`. The response contains the media id.
3. Swap it into the slide with `update_fill` on the existing image element, then `crop_media` with `left: 0, top: 0` and the element's width and height so it is not zoomed. Alt text must stay under about 200 characters.
4. Slide titles are Canva text, not part of the image.

## Rules used in these images

- All money is in USD with an RMB equivalent, at US$1 = RMB 6.7313 (CFETS, 12 Oct 2026).
- Palette: Monara blue `#3171FD`, dark `#1f4fc4`, pale blues `#dce7ff` and `#eef3ff`, text `#1b1b1b` and `#14307f`.

## Research

`research/` holds the two research reports the deck's numbers come from. They were written by a separate research agent and are kept as received, including its citation markers.

- `research/sea-market-competition-compliance.md`: SEA market sizing, competitors, Chinese fintech relevance, privacy law per market, pricing benchmarks and the WeBank audience.
- `research/sea-evidence-pain-intent-ability.md`: comparable cross-country evidence for the problem slide (tracking, cushion, intent to use AI help, ability to pay), with a list of what can and cannot be plotted together and which claims not to make.
