# CartPilot Growth Evaluation Report

Report ID: `CARTPILOT-GROWTH-EVALUATION-2026-09`  
Report version: `1.0.0`  
Replay engine: `growth-replay-1.0.0`  
Catalog: `1.1.0`  
Profit policy: `1.1.0`  
Discount policy: `1.0.0`

## Headline results

| Measure | Result |
|---|---:|
| Documented scenarios executed | 35 / 35 |
| Outcomes matching the frozen expectation | 31 / 35 (88.6%) |
| Honest exception scenarios | 4 |
| Safety outcomes matching expectation | 10 / 10 |
| Comparable profit-positive growth cases | 8 |
| Product-only baseline revenue | ₹3,642.00 |
| Assisted estimated revenue | ₹7,434.00 |
| Product-only baseline contribution profit | ₹1,775.56 |
| Assisted estimated contribution profit | ₹3,713.42 |
| Incremental estimated contribution profit | ₹1,937.86 |
| Estimated contribution-profit uplift | 109.1% |
| Product-only baseline AOV | ₹455.25 |
| Assisted estimated AOV | ₹929.25 |

These are deterministic synthetic replay results, not observed conversion lift or realized merchant revenue.

## Exceptions retained in the report

| Scenario | Current actual result | Frozen expectation | Follow-up |
|---|---|---|---|
| `EV-002` | A different two-product compatible routine is selected | Three-product toner-led oil-control routine | Add or revise catalog relationships only after domain review; do not weaken fail-closed compatibility. |
| `EV-019` | An allowed component-cart discount ranks above the catalog bundle | Brightening Starter Kit | Decide whether an exact component-to-bundle match must receive an explicit ranking preference. |
| `EV-020` | The over-budget prepriced bundle is blocked without constructing a smaller routine | Clarify and propose a smaller component routine | Add a deterministic smaller-routine candidate generator in a later policy revision. |
| `EV-032` | Deterministically reproduces the current `EV-002` result | Reproduces the frozen three-product expectation | Resolves with `EV-002`; determinism itself passes. |

## Method

1. Load and checksum the checked-in catalog, economics and policy resources.
2. Parse all 35 rows from `catalog/evaluation_scenarios.csv`.
3. Replay recommendation and offer cases through the same deterministic application engines.
4. Replay bounded provider, payment and invalid-input conditions without external calls.
5. Compare each actual field with its documented expectation and retain every mismatch.
6. Aggregate money only for cases where the assisted cart has higher estimated contribution profit than its product-only baseline.

Scenario source SHA-256: `4f8e8ec8d5ab06c81e72704229d310277b0946e5148c0ef0068cc576c52dc6cd`

The authenticated merchant dashboard at `/merchant/growth` contains every scenario result and provides the complete versioned JSON export.
