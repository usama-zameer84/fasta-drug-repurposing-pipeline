# FASTA to Drug Repurposing Pipeline

An automated bioinformatics pipeline built with [n8n](https://n8n.io/) that takes a raw
FASTA DNA sequence, identifies the gene it encodes, and returns a styled HTML
drug-repurposing report with pathway enrichment and known drug-gene interactions.

> Live workflow ID: `JBCJJDYQ6whXDduZ` — deployed and running on a self-hosted n8n
> instance. The `workflow.json` in this repo is an exact export of that running workflow
> (14 nodes) and is kept in sync with it.

## What it does

```
FASTA input → NCBI BLAST (refseq_rna / blastn) → gene identification
            → g:Profiler (KEGG / WikiPathways / Reactome enrichment)
            → DGIdb (drug-gene interactions)
            → HTML drug-repurposing report
```

1. **Webhook trigger** — receives a `POST` request whose body contains a FASTA sequence.
2. **FASTA parsing & validation** — normalises the sequence and validates that it only
   contains DNA nucleotides.
3. **NCBI BLAST** — submits the sequence to the `refseq_rna` database using the `blastn`
   program, then polls until the results are ready.
4. **Gene symbol extraction** — parses the BLAST hits (and the FASTA header) to recover
   standard human gene symbols.
5. **g:Profiler enrichment** — queries [g:Profiler](https://biit.cs.ut.ee/gprofiler/)
   for enriched pathways across KEGG, WikiPathways and Reactome (FDR-corrected).
6. **DGIdb drug interactions** — queries [DGIdb 5.0](https://dgidb.org/) for known
   drug-gene interactions for the identified genes.
7. **HTML report** — assembles all of the above into a single styled HTML page and
   returns it as the webhook response (`Content-Type: text/html`).

The response is an **HTML page** (not JSON) — it renders the identified genes, the top
pathway hits from each source, and a ranked table of drug candidates with interaction
scores. A real example is in [`examples/sample-drug-report.html`](examples/sample-drug-report.html).

## Usage

Send a `POST` to the webhook with a `sequence` field containing a FASTA-formatted string:

```bash
curl -X POST \
  https://n8n.reaperautomate.work/webhook/fasta-analysis \
  -H 'Content-Type: application/json' \
  -d '{"sequence": ">Human_KRAS_mRNA_fragment\nGAGTGTGGTTGTGGGCAGCTGGTGGTGGCCATCAGCTCCACCACTGTGGTGGTGCCCTTGATGGAGAGTTTTGGTGGGTAGCTCTGGGCAAGCATTTGGAGTT"}'
```

The body shape is `{"sequence": ">Header\nATCG..."}` — the `>Header` line is used to help
gene identification, and the nucleotide lines are validated as DNA before being sent to BLAST.

> **Note on latency:** NCBI BLAST typically takes **1–3 minutes** to complete, so the
> webhook is long-lived. For live demos it is usually easier to trigger the workflow from
> the n8n UI and watch the execution rather than holding a `curl` connection open.

See [`examples/`](examples/) for a sample input payload and the real HTML report returned
for a KRAS fragment (identified KRAS, with pathway + drug-interaction data).

## Repository structure

```
workflow.json                                     # Exact export of the live 14-node n8n workflow (source of truth)
FASTA_Drug_Repurposing_Pipeline.workflow.ts       # n8n-as-code TypeScript definition
src/FASTA_Drug_Repurposing_Pipeline.workflow.ts   # Same TypeScript definition under src/
examples/                                         # Sample input + real HTML output from a successful KRAS run
assets/                                           # Workflow canvas screenshot
```

`workflow.json` is the authoritative, runnable definition — import it directly into an n8n
workspace. The `.ts` file is a readable n8n-as-code view of the same pipeline.

## Deployment

Import `workflow.json` directly into your n8n instance via the UI
(`… > Import from File`), then activate the workflow and use its webhook URL. Because the
pipeline calls public APIs (NCBI BLAST, g:Profiler, DGIdb), no credentials are required.

## License

[MIT](LICENSE) © 2026 Usama Zameer