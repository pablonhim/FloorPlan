# PDF layout import

Regenerates `src/model/layouts.json` from the official layout PDF (pages 2, 3, 5, 6 = 2C, 2D, 4C, 4D).
Needs Python with `pypdf` and Pillow. The PDF path is set at the top of `1_render_pdf.py`.

```
python 1_render_pdf.py OUT 1.4 2,3,5,6       # parse vectors -> OUT/p*.json (+ check PNGs)
python 2_extract.py OUT                      # shapes -> grid items (1 cell = 20 cm, tile = 3 cells)
python 3_build_layouts.py OUT ../../src/model/layouts.json
```

Colour keys used by the extractor (from the PDF legend): black 4.5pt stroke = wall, light blue = glass wall,
green = partition, black ~33pt square = pillar (សសរ), white 64.6×54.8pt box = desk (140×120 cm),
orange = team-lead drawer, blue/beige/purple = WeCafe tables/stools/round tables.
Room and department zones are defined by hand in `ZONES` in `3_build_layouts.py`.
