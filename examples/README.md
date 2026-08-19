# Examples

This directory holds real input/output artifacts from a successful end-to-end run of the
**FASTA to Drug Repurposing Pipeline** (n8n workflow `JBCJJDYQ6whXDduZ`).

## Files

### `sample-fasta-input.json`
The JSON payload POSTed to the workflow's webhook. The body must contain a `sequence`
field whose value is a FASTA-formatted string (`>Header\nACGT...`). The example here is a
short human **KRAS** mRNA fragment that the pipeline successfully identified.

### `sample-drug-report.html`
The actual HTML drug-repurposing report returned by the webhook for the input above.
This is the real response body (Content-Type `text/html`), not a mockup. For the KRAS
input the pipeline returned:

- **Identified gene:** KRAS
- **KEGG pathways** — e.g. Non-small cell lung cancer, Pancreatic cancer, Glioma
- **WikiPathways** — e.g. RalA downstream regulated genes, Pilocytic astrocytoma
- **Reactome** — e.g. Signaling by RAS GTPase mutants, RAS processing
- **Drug interactions (DGIdb 5.0)** — e.g. SOTORASIB, ADAGRASIB, ARS-1620, PANITUMUMAB

## How to reproduce

Send `sample-fasta-input.json` to the webhook (see the repo's main README for the exact
curl command). Note: NCBI BLAST takes ~1–3 minutes, so the webhook is long-lived — for
live demos it is usually easier to trigger the workflow from the n8n UI and watch the
execution rather than holding a curl connection open.