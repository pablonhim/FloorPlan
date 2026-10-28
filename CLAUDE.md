# Engineering Harness: Isometric Office Floor Plan Builder

## Tech Stack & Constraints
- Frontend: React + Vite + Tailwind CSS.
- Canvas Engine: HTML5 Canvas or Konva.js for isometric math projection.
- No loose vibe-coding: Every component must follow strict grid-snapping logic and coordinate matrices.

## Architectural Requirements
1. Building & Floor Context:
   - 11-storey exterior schematic view: ground floor G, then floors 1–10 (Cambodian numbering).
   - Floors 2 and 4 are interactive, editable, and designated as active/rented.
2. Grid & Snapping Engine:
   - Isometric projection conversion: Screen coordinates $\leftrightarrow$ Isometric grid coordinates.
   - 100% strict snapping for dragging and dropping furniture, desks, partitions, and pillars (សសរ).
3. Object Management:
   - Elements: Desks (with employee assignments), Meeting Rooms, WeCafe, Elevators, Restrooms, Partitions, Pillars (សសរ).
   - Rotation: 90-degree isometric rotational snapping.
   - Persistence: LocalStorage saving and PNG export capability.
