# Bookmark Filter icons

`bookmark-filter-master.png` is the selected original AI-generated raster master produced with the built-in image generation tool. Cleanup variants were rejected and are not part of this repository.

Exact generation prompt:

> Use case: logo-brand. Create one original app icon for a Chrome extension named Bookmark Filter (do not render text). A bold, simple bookmark ribbon silhouette with a clean white funnel/filter cutout centered inside, discreet and suitable for a productivity tool. Flat deep teal bookmark, white cutout; no site branding, no letters, no adult imagery, no shadows, no mockup, no texture, no gradients. Strong single recognizable silhouette with thick shapes that remain clear when reduced to 16px. Square canvas, centered with only a small even safety margin. Genuinely transparent background outside the bookmark. Deliver a single PNG icon master.

Rebuild the derived PNG icons with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-icons.ps1
```
