# NAMES rank display

**Rank 1** preserves the recorded rank, specification and specialization, such as `Cpl/Drv`, `C.I(W)` or `PC(W)/Sig`. **Rank 2** supplies the overall rank used to group officers. `Cpl/Drv` and `Cpl` both group under `CPL`; `CP` is a distinct rank and is never an alias for `CPL`. Original workbook cells are retained unchanged. Unrecognized or blank Rank 2 values remain unmapped; specialist text is not used to guess a different official rank.

Current displays use **AIG, CP, SSP, SP, ASP, CI, IP, S/SGT, SGT, CPL, PC**, highest first. S/AIG and RSM remain available in historical strength comparison and stored references. This is display ordering, not a database rewrite of rank histories or hierarchy policies.

Officers shows both rank columns. Rank order is the initial order for users with rank access; **Seniority (CO first)** remains available separately. Rank filters group specialists under their overall rank. Filtering and sorting happen before pagination. Unmapped ranks stay after the ordered ranks. Officers with verified effective rank history use that current history; others use their linked NAMES source and are labelled as awaiting verification. Source data never creates a verified promotion or invents a promotion date.

Rank columns require `fields.rank_history.view`. Workbook fallback additionally requires `fields.import_source.view`; source encryption and identity checks remain enforced. Existing source keys, imports and officer records must be preserved. No workbook reimport or new database migration is required.
