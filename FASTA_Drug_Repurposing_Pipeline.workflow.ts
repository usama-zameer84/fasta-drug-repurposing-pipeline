import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : FASTA to Drug Repurposing Pipeline
// Nodes   : 14  |  Connections: 12
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ArchitectureNotes                  stickyNote
// UsageInstructions                  stickyNote
// FastaWebhook                       webhook
// ParseAndValidateFasta              code
// NcbiBlastSubmit                    httpRequest
// ExtractRequestId                   code
// BlastGetResults                    httpRequest
// ExtractGeneSymbols                 code
// FormatFinalReport                  code
// ReturnHttpReport                   respondToWebhook
// CheckIfReady                       if
// GprofilerEnrichment                httpRequest
// DgidbDrugInteractions              httpRequest
// WaitForBlast                       wait
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// FastaWebhook
//    → ParseAndValidateFasta
//      → NcbiBlastSubmit
//        → ExtractRequestId
//          → WaitForBlast
//            → BlastGetResults
//              → ExtractGeneSymbols
//                → CheckIfReady
//                  → GprofilerEnrichment
//                    → DgidbDrugInteractions
//                      → FormatFinalReport
//                        → ReturnHttpReport
//                 .out(1) → WaitForBlast (↩ loop)
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'Yu3rRGPd1FCNtdvY',
    name: 'FASTA to Drug Repurposing Pipeline',
    active: false,
    isArchived: false,
    settings: {
        executionOrder: 'v1',
        binaryMode: 'separate',
        availableInMCP: true,
        callerPolicy: 'workflowsFromSameOwner',
    },
})
export class FastaToDrugRepurposingPipelineWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '44b83c81-3fa7-4614-a383-3af0a2b97e34',
        name: 'Architecture Notes',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [-224, 176],
    })
    ArchitectureNotes = {
        content: `## 🧬 FASTA → Drug Repurposing
**Production Build — n8n 2.9.4 compatible**

### Rules enforced
- 🟢 HTTP calls → HTTP Request nodes only
- 🔴 Code nodes → pure JS transforms only
- Every failure throws a descriptive error

### Sequence size guidance
| Size | Wait time |
|---|---|
| < 500bp | 90s |
| 500–2000bp | 120s |
| > 2000bp | 180s+ |

To change wait → open **Wait for BLAST**
and adjust \`amount\`.`,
        height: 400,
        width: 460,
        color: 5,
    };

    @node({
        id: '80eba19a-be01-4a19-b15c-9f0b60a2feb2',
        name: 'Usage Instructions',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [272, 192],
    })
    UsageInstructions = {
        content: `## 📡 How to Call

\`\`\`bash
curl -X POST \\
  YOUR_WEBHOOK_URL \\
  -H 'Content-Type: application/json' \\
  -d '{
    "sequence": ">KRAS\\nATGACTGAAT..."
  }'
\`\`\`

Response is a full JSON with:
- \`report\` (Markdown)
- \`genes\` (array)
- \`keggTop\` (pathways)
- \`wikiTop\` (pathways)
- \`drugs\` (LINCS candidates)`,
        height: 384,
        width: 1144,
        color: 3,
    };

    @node({
        id: '25af0ee1-910a-4e5b-b026-ec42f35a1547',
        webhookId: '2a986fcd-3359-4401-8217-98ed1ef389d3',
        name: 'FASTA Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2,
        position: [-208, 640],
    })
    FastaWebhook = {
        httpMethod: 'POST',
        path: 'fasta-analysis',
        responseMode: 'responseNode',
        options: {},
    };

    @node({
        id: '1e80a658-9e52-4db5-a216-135dc4cdc737',
        name: 'Parse and Validate FASTA',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [16, 640],
    })
    ParseAndValidateFasta = {
        jsCode: `// INPUT: POST body with {"sequence": ">Header\\nATCGATCG..."}
const raw = $json.body?.sequence
         ?? $json.sequence
         ?? $json.body
         ?? '';

const fastaStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
if (!fastaStr.trim()) {
  throw new Error('Empty input. Send a POST with body: {"sequence": ">GeneHeader\\\\nATCGATCG..."}');
}

const seqs = [];
let cur = { header: '', seq: '' };
for (const line of fastaStr.split('\\n')) {
  const t = line.trim();
  if (t.startsWith('>')) {
    if (cur.seq) seqs.push({ ...cur });
    cur = { header: t.slice(1), seq: '' };
  } else if (t && !t.startsWith(';')) {
    cur.seq += t.toUpperCase(); // normalise to uppercase
  }
}
if (cur.seq) seqs.push(cur);

if (!seqs.length) {
  throw new Error('No valid FASTA sequences found. Format: ">Header\\\\nATCGATCG..."');
}

// Validate sequence characters
const validDNA = /^[ACGTNRYSWKMBDHV]+$/;
for (const s of seqs) {
  if (!validDNA.test(s.seq)) {
    throw new Error(\`Sequence "\${s.header}" contains invalid characters. Only DNA nucleotides allowed.\`);
  }
}

return [{ json: {
  combinedFasta: seqs.map(s => \`>\${s.header}\\n\${s.seq}\`).join('\\n'),
  seqCount:      seqs.length,
  totalBases:    seqs.reduce((n, s) => n + s.seq.length, 0),
  headers:       seqs.map(s => s.header)
}}];`,
    };

    @node({
        id: 'c83b0659-0d99-4ae8-84a5-f041a544153c',
        name: 'NCBI BLAST Submit',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.2,
        position: [240, 640],
    })
    NcbiBlastSubmit = {
        method: 'POST',
        url: 'https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi',
        sendBody: true,
        contentType: 'form-urlencoded',
        bodyParameters: {
            parameters: [
                {
                    name: 'CMD',
                    value: 'Put',
                },
                {
                    name: 'QUERY',
                    value: '={{ $json.combinedFasta }}',
                },
                {
                    name: 'DATABASE',
                    value: 'refseq_rna',
                },
                {
                    name: 'PROGRAM',
                    value: 'blastn',
                },
                {
                    name: 'FORMAT_TYPE',
                    value: 'JSON2',
                },
                {
                    name: 'HITLIST_SIZE',
                    value: '20',
                },
                {
                    name: 'EXPECT',
                    value: '0.001',
                },
                {
                    name: 'MEGABLAST',
                    value: 'on',
                },
                {
                    name: 'EMAIL',
                    value: 'n8n-bot@bioinformatics.local',
                },
            ],
        },
        options: {
            response: {
                response: {
                    responseFormat: 'text',
                },
            },
            timeout: 30000,
        },
    };

    @node({
        id: 'a2e40787-41f5-48a2-926e-0d791a718752',
        name: 'Extract Request ID',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [464, 640],
    })
    ExtractRequestId = {
        jsCode: `// Extract BLAST Request ID from NCBI's HTML response
const html = $json.data ?? (typeof $json === 'string' ? $json : JSON.stringify($json));
const ridMatch  = String(html).match(/RID\\s*=\\s*([A-Z0-9]+)/);
const rtoeMatch = String(html).match(/RTOE\\s*=\\s*(\\d+)/);

if (!ridMatch) {
  throw new Error(
    'BLAST submission failed — RID not returned.\\n' +
    'Possible causes: NCBI rate limit hit, invalid sequence, or server issue.\\n' +
    'Preview: ' + String(html).slice(0, 300)
  );
}

const rid  = ridMatch[1];
const rtoe = rtoeMatch ? +rtoeMatch[1] : 60;

return [{ json: {
  rid,
  estimatedWait: rtoe,
  submittedAt:   new Date().toISOString(),
  ncbiUrl:       \`https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi?CMD=Get&RID=\${rid}\`
}}];`,
    };

    @node({
        id: '639021f1-d248-47d8-be5f-055551649851',
        name: 'BLAST Get Results',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.2,
        position: [912, 560],
    })
    BlastGetResults = {
        url: 'https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi',
        sendQuery: true,
        queryParameters: {
            parameters: [
                {
                    name: 'CMD',
                    value: 'Get',
                },
                {
                    name: 'RID',
                    value: '={{ $json.rid }}',
                },
                {
                    name: 'FORMAT_TYPE',
                    value: 'JSON2_S',
                },
                {
                    name: 'HITLIST_SIZE',
                    value: '20',
                },
            ],
        },
        options: {
            response: {
                response: {
                    neverError: true,
                    responseFormat: 'text',
                },
            },
            timeout: 30000,
        },
    };

    @node({
        id: '07ac394a-43b6-413d-9152-67ccbbc6ff99',
        name: 'Extract Gene Symbols',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1136, 560],
    })
    ExtractGeneSymbols = {
        jsCode: `const rid   = $('Extract Request ID').item.json.rid;
const input = $json;

// ── Step 1: Get raw text ──────────────────────────────────────
let text = '';
if (input?.data && typeof input.data === 'string') { text = input.data; }
else if (input?.BlastOutput2) { text = JSON.stringify(input); }
else { text = JSON.stringify(input); }

// ── Step 2: Check NCBI failure states ────────────────────────
if (text.includes('Status=WAITING') || text.includes('Status=UNKNOWN')) {
  return [{ json: { isReady: false, rid, reason: 'BLAST still processing' } }];
}
if (text.includes('Status=FAILED')) {
  return [{ json: { isReady: false, rid, reason: 'BLAST job failed — resubmit' } }];
}
if (text.includes('RID not found')) {
  return [{ json: { isReady: false, rid, reason: 'RID expired — resubmit' } }];
}

// ── Step 3: Parse JSON ────────────────────────────────────────
let blastData;
try {
  blastData = input?.BlastOutput2 ? input : JSON.parse(text);
} catch(e) {
  return [{ json: { isReady: false, rid, reason: 'Response not JSON yet — still loading' } }];
}

if (!blastData?.BlastOutput2?.[0]?.report?.results?.search) {
  return [{ json: { isReady: false, rid, reason: 'Invalid BLAST structure' } }];
}

const search  = blastData.BlastOutput2[0].report.results.search;
const geneSet = new Set();

// Keywords to skip when parsing the FASTA header
const SKIP = new Set(['NM','XM','NR','XR','NG','NC','CDS','MRNA','HOMO','SAPIENS',
                      'PARTIAL','PREDICTED','TRANSCRIPT','VARIANT','COMPLETE','HUMAN']);

// ── Strategy A: Parse gene name from FASTA header ─────────────
// e.g. ">KRAS_partial_CDS_NM_004985.5_Homo_sapiens" → KRAS  ✅
const queryTitle = search.query_title ?? '';
for (const token of queryTitle.split(/[_\\s\\.\\-]+/)) {
  if (/^[A-Z][A-Z0-9]{1,9}$/.test(token) && !SKIP.has(token)) {
    geneSet.add(token);
  }
}

// ── Strategy B: Human hits ─────────────────────────────────────
// Catches sequences with actual Homo sapiens hits
for (const hit of (search.hits || [])) {
  for (const desc of (hit.description || [])) {
    if (desc.sciname?.includes('Homo sapiens') || desc.taxid === 9606) {
      const m = desc.title?.match(/\\(([A-Z][A-Z0-9\\-]{1,9})\\)/);
      if (m) geneSet.add(m[1]);
    }
  }
}

// ── Strategy C: All hits fallback ─────────────────────────────
// Safe for conserved genes (KRAS in macaque IS human KRAS — same symbol)
// Your KRAS query hit primates only — this catches it  ✅
if (geneSet.size === 0) {
  for (const hit of (search.hits || [])) {
    for (const desc of (hit.description || [])) {
      const m = desc.title?.match(/\\(([A-Z][A-Z0-9\\-]{1,9})\\)/);
      if (m) geneSet.add(m[1]);
    }
  }
}

if (geneSet.size === 0) {
  return [{ json: {
    isReady: false, rid,
    reason: \`No gene symbols found in \${search.hits?.length ?? 0} hits. \` +
            \`Add gene name to FASTA header (e.g. >KRAS) or try a longer sequence.\`
  }}];
}

const genes = [...geneSet];
return [{ json: {
  isReady:      true,
  genes,
  geneString:   genes.join('\\n'),
  geneCount:    genes.length,
  rid,
  totalHits:    search.hits?.length ?? 0,
  extractedFrom: queryTitle ? 'FASTA header + BLAST hits' : 'BLAST hits',
  completedAt:  new Date().toISOString()
}}];`,
    };

    @node({
        id: '66eb4ff2-7e61-46c2-9516-815f9d32e144',
        name: 'Format Final Report',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2032, 640],
    })
    FormatFinalReport = {
        jsCode: `const genes     = $('Extract Gene Symbols').item.json;
const gProfiler = $('gProfiler Enrichment').item.json;
const dgiRaw    = $json;

const results = gProfiler?.result ?? [];
const kegg = results.filter(r => r.source === 'KEGG').slice(0, 5);
const wp   = results.filter(r => r.source === 'WP').slice(0, 5);
const reac = results.filter(r => r.source === 'REAC').slice(0, 5);

const geneNodes = dgiRaw?.data?.genes?.nodes ?? [];
const drugs = [];
for (const g of geneNodes) {
  for (const ix of (g.interactions ?? [])) {
    drugs.push({
      gene:  g.name,
      drug:  ix.drug?.name ?? 'N/A',
      score: typeof ix.interactionScore === 'number' ? ix.interactionScore.toFixed(2) : 'N/A',
      type:  (ix.interactionTypes ?? []).map(t => t.type).join(', ') || 'N/A'
    });
  }
}
drugs.sort((a,b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));

const tableRows = (arr, cols) => arr.length
  ? arr.map(r => \`<tr>\${cols.map(c => \`<td>\${r[c] ?? ''}</td>\`).join('')}</tr>\`).join('')
  : \`<tr><td colspan="\${cols.length}" class="empty">No results found</td></tr>\`;

const pathwayTable = (arr) => \`
  <table>
    <thead><tr><th>#</th><th>Pathway</th><th>p-value</th><th>adj p-value</th><th>Hits</th></tr></thead>
    <tbody>\${arr.length ? arr.map((r,i) => \`
      <tr>
        <td>\${i+1}</td>
        <td>\${r.name}</td>
        <td>\${r.p_value?.toExponential(2) ?? 'N/A'}</td>
        <td>\${r.p_value ? (r.p_value * (r.term_size ?? 1)).toExponential(2) : 'N/A'}</td>
        <td>\${r.intersection_size ?? 'N/A'}</td>
      </tr>\`).join('') : '<tr><td colspan="5" class="empty">No results</td></tr>'}
    </tbody>
  </table>\`;

const html = \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Drug Repurposing Report — \${genes.genes.join(', ')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f1117; color: #e2e8f0; padding: 2rem; }
    .container { max-width: 1100px; margin: 0 auto; }
    header { background: linear-gradient(135deg, #1a1f2e, #2d3748);
             border: 1px solid #4a5568; border-radius: 12px;
             padding: 2rem; margin-bottom: 2rem; }
    header h1 { font-size: 1.8rem; color: #68d391; margin-bottom: 0.5rem; }
    .meta { display: flex; gap: 2rem; flex-wrap: wrap; margin-top: 1rem; }
    .meta-item { background: #2d3748; padding: 0.5rem 1rem;
                 border-radius: 8px; font-size: 0.85rem; }
    .meta-item span { color: #a0aec0; }
    .gene-tag { display: inline-block; background: #276749; color: #9ae6b4;
                border-radius: 20px; padding: 0.2rem 0.8rem;
                font-size: 0.85rem; margin: 0.2rem; font-weight: 600; }
    section { background: #1a1f2e; border: 1px solid #2d3748;
              border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
    section h2 { font-size: 1.2rem; color: #63b3ed; margin-bottom: 1rem;
                 padding-bottom: 0.5rem; border-bottom: 1px solid #2d3748; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    th { background: #2d3748; color: #a0aec0; text-align: left;
         padding: 0.6rem 0.8rem; font-weight: 600; text-transform: uppercase;
         font-size: 0.75rem; letter-spacing: 0.05em; }
    td { padding: 0.6rem 0.8rem; border-bottom: 1px solid #2d3748; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #2d3748; }
    .drug-name { color: #f6ad55; font-weight: 600; }
    .score { color: #68d391; font-family: monospace; }
    .type { color: #b794f4; font-size: 0.8rem; }
    .empty { color: #718096; text-align: center; padding: 1.5rem; }
    .rid { font-family: monospace; color: #fbb6ce; }
    footer { text-align: center; color: #4a5568; font-size: 0.8rem; margin-top: 2rem; }
  </style>
</head>
<body>
<div class="container">
  <header>
    <h1>🧬 FASTA → Drug Repurposing Report</h1>
    <div>
      \${genes.genes.map(g => \`<span class="gene-tag">\${g}</span>\`).join('')}
    </div>
    <div class="meta">
      <div class="meta-item"><span>BLAST RID: </span><span class="rid">\${genes.rid}</span></div>
      <div class="meta-item"><span>Genes found: </span>\${genes.geneCount}</div>
      <div class="meta-item"><span>BLAST hits: </span>\${genes.totalHits ?? 'N/A'}</div>
      <div class="meta-item"><span>Generated: </span>\${new Date().toLocaleString()}</div>
    </div>
  </header>

  <section>
    <h2>📈 KEGG Pathways</h2>
    \${pathwayTable(kegg)}
  </section>

  <section>
    <h2>🗺️ WikiPathways</h2>
    \${pathwayTable(wp)}
  </section>

  <section>
    <h2>🔬 Reactome</h2>
    \${pathwayTable(reac)}
  </section>

  <section>
    <h2>💊 Drug Interactions (DGIdb 5.0)</h2>
    <table>
      <thead><tr><th>#</th><th>Drug</th><th>Gene</th><th>Score</th><th>Interaction Type</th></tr></thead>
      <tbody>
        \${drugs.slice(0,10).length ? drugs.slice(0,10).map((d,i) => \`
          <tr>
            <td>\${i+1}</td>
            <td class="drug-name">\${d.drug}</td>
            <td>\${d.gene}</td>
            <td class="score">\${d.score}</td>
            <td class="type">\${d.type}</td>
          </tr>\`).join('') : '<tr><td colspan="5" class="empty">No drug interactions found</td></tr>'}
      </tbody>
    </table>
  </section>

  <footer>Generated by FASTA → Drug Repurposing Pipeline · n8n · \${new Date().getFullYear()}</footer>
</div>
</body>
</html>\`;

return [{ json: { html, genes: genes.genes, kegg, wp, reac, drugs: drugs.slice(0,10), generatedAt: new Date().toISOString() } }];`,
    };

    @node({
        id: '2442281c-09b0-469d-b5f2-c74bb4daec2a',
        name: 'Return HTTP Report',
        type: 'n8n-nodes-base.respondToWebhook',
        version: 1,
        position: [2256, 640],
    })
    ReturnHttpReport = {
        respondWith: 'text',
        responseBody: '=={{ $json.html }}',
        options: {
            responseCode: 200,
            responseHeaders: {
                entries: [
                    {
                        name: 'Content-Type',
                        value: 'text/html; charset=utf-8',
                    },
                ],
            },
        },
    };

    @node({
        id: '2b7f76e6-3f56-4ae1-9945-d31a4ecf3206',
        name: 'Check If Ready',
        type: 'n8n-nodes-base.if',
        version: 2.3,
        position: [1360, 640],
    })
    CheckIfReady = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: "",
                typeValidation: "strict",
                version: 3
            },
            conditions: [
                {
                    id: "30041650-ee64-4d49-984d-1360f4794e74",
                    leftValue: "={{ $json.isReady }}",
                    rightValue: false,
                    operator: {
                        type: "boolean",
                        operation: "true",
                        singleValue: true
                    }
                }
            ],
            combinator: "or"
        },
        options: {}
    };

    @node({
        id: '4b7fb1bf-9afc-4e19-9700-b1e865239a94',
        name: 'gProfiler Enrichment',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [1584, 640],
    })
    GprofilerEnrichment = {
        method: 'POST',
        url: 'https://biit.cs.ut.ee/gprofiler/api/gost/profile/',
        sendBody: true,
        contentType: 'raw',
        rawContentType: 'application/json',
        body: '={   "organism": "hsapiens",   "query": {{ JSON.stringify($(\'Extract Gene Symbols\').item.json.genes) }},   "sources": ["KEGG", "WP", "REAC"],   "user_threshold": 0.05,   "significance_threshold_method": "fdr",   "no_iea": false }',
        options: {},
    };

    @node({
        id: 'fe1007ea-8a7a-4f54-bf23-c99a0cfed9c0',
        name: 'DGIdb Drug Interactions',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.2,
        position: [1808, 640],
    })
    DgidbDrugInteractions = {
        method: 'POST',
        url: 'https://dgidb.org/api/graphql',
        sendBody: true,
        contentType: 'raw',
        rawContentType: 'application/json',
        body: `={{ JSON.stringify({ query: \`{ genes(names: \${JSON.stringify($('Extract Gene Symbols').item.json.genes)}) { nodes { name interactions { drug { name } interactionScore interactionTypes { type } } } } }\` }) }}
`,
        options: {
            timeout: 20000,
        },
    };

    @node({
        id: '19248afd-4b34-4781-a710-c952cda04d51',
        webhookId: '4e4ef384-a15b-4f69-bb34-f13cfe5c646a',
        name: 'Wait for BLAST',
        type: 'n8n-nodes-base.wait',
        version: 1,
        position: [688, 640],
    })
    WaitForBlast = {
        amount: 20,
        unit: 'seconds',
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.FastaWebhook.out(0).to(this.ParseAndValidateFasta.in(0));
        this.ParseAndValidateFasta.out(0).to(this.NcbiBlastSubmit.in(0));
        this.NcbiBlastSubmit.out(0).to(this.ExtractRequestId.in(0));
        this.ExtractRequestId.out(0).to(this.WaitForBlast.in(0));
        this.WaitForBlast.out(0).to(this.BlastGetResults.in(0));
        this.BlastGetResults.out(0).to(this.ExtractGeneSymbols.in(0));
        this.ExtractGeneSymbols.out(0).to(this.CheckIfReady.in(0));
        this.CheckIfReady.out(0).to(this.GprofilerEnrichment.in(0));
        this.CheckIfReady.out(1).to(this.WaitForBlast.in(0));
        this.GprofilerEnrichment.out(0).to(this.DgidbDrugInteractions.in(0));
        this.DgidbDrugInteractions.out(0).to(this.FormatFinalReport.in(0));
        this.FormatFinalReport.out(0).to(this.ReturnHttpReport.in(0));
    }
}