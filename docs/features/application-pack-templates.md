# Application Pack Templates

> Documents **existing**, verified code (`apps/documents/pack_templates.py`,
> `PackTemplatesView` at `document-bundles/pack-templates/`; checklist-template models
> `DocumentChecklistTemplate` / `DocumentChecklistItemTemplate`). Recorded for Phase 17.

## Scope

Generic, customizable templates (visa / scholarship / university / job / travel / renewal /
emergency / custom) that seed an Application Pack ("Bundle") checklist.

## What it does not claim

- **Generic, not official.** Templates are starting points; requirements vary, so the user
  must verify with the official institution/source. This disclaimer is part of the copy.

## API

- `document-bundles/pack-templates/` — list pack templates (`PackTemplatesView`).
- `documents/checklist-templates/` (+ `…/<id>/`) — shared, read-only checklist templates.
- `documents/<id>/checklists/from-template/` — create a checklist from a template.

## Status

Backend implemented (templates + create-from-template). Application Packs ("Bundles") UI at
`/dashboard/bundles`. Covered by `test_application_packs.py` / renewal-workspace tests.

## Cross-feature

Creating a pack from a template produces a real checklist that the user customizes;
documents (including Fill & Sign prepared copies) attach to checklist items via the
existing pack flows.
