// Shared world units, at the real scale of the official layout PDF.
//   1 cell  = 20 cm  = CELL world units   (strict snapping unit)
//   1 tile  = 60 cm  = 3 cells            (the ceiling-tile grid drawn on the PDF plans)
//   1 world unit = 2 cm
export const CELL = 10;
export const TILE = 3;

/** Heights in world units. Walls are shown cut at ~72 cm (pillars ~1.1 m) so rooms stay readable. */
export const WALL_H = 36;
export const PILLAR_H = 56;
export const SLAB = 8;

/** Height at which tall parts are cut when cutaway view is on (~40 cm). */
export const CUT_H = 20;

/** Allowed rotations: strict 90° steps. */
export const ROTATIONS = [0, 90, 180, 270];
