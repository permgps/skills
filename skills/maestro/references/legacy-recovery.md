# Recovering A Run Below Contract 4

Opened from `SKILL.md` *Recovery* when `contractVersion` is below 4, and closed again.

If `contractVersion` is below 4, inspect it with
`node .maestro/sync.mts --project .maestro/state.js`. Its historical G4 and
finished timestamp remain readable, but verification is not established.
Resuming is an explicit candidate transition: retain the old record, create
contract-4 verification entries for the still-applicable requirements with
incomplete results and open findings, and publish through `--publish` with
`--expect`. Never infer passing checks from historical task or gate statuses;
fresh executions and acceptance are required before `completed`.
