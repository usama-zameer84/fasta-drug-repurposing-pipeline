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
// WORKFLOW METADATA
// =====================================================================

@workflow({
    id: 'k0VfKq23A8s5aUfP',
    name: 'FASTA to Drug Repurposing Pipeline',
    active: false,
    isArchived: false,
    settings: { executionOrder: 'v1' },
})
export class FastaToDrugRepurposingPipelineWorkflow {
    // =====================================================================
    // NODE CONFIGURATION
    // =====================================================================

    @node({
        id: '9211c422-b9cf-4a47-a8bc-60a6311ceef9',
        name: 'Architecture Notes',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [-64, -144],
    })
    ArchitectureNotes = {
        content: `## Pipeline Flow
1. **Intake**: Accept FASTA (text or binary format)
2. **NCBI BLAST**: Submit sequence to find homologous genes/proteins
3. **Polling Loop**: Wait and check BLAST status until 'READY'
4. **Parsing**: Extract gene symbols from the top alignments
5. **g:Profiler**: Find enriched biological pathways (KEGG, Reactome)
6. **DGIdb**: Map identified genes to known drug interactions
7. **Reporting**: Return a comprehensive HTML report`,
        height: 304,
        width: 320,
        color: 6,
    };

    @node({
        id: 'dae2bdce-069a-4c28-bbba-c9a17ce3d6a4',
        name: 'Usage Instructions',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [-64, 208],
    })
    UsageInstructions = {
        content: `### Webhook Execution
Send a POST request to the Webhook URL:
\`\`\`json
{
  "sequence": ">DrugTarget1\\nMSLNNLQIEQKPLDIL..."
}
\`\`\`
Or upload a \`.fasta\` file as binary data.`,
        height: 256,
        width: 320,
        color: 5,
    };

    @node({
        id: '266fc033-024f-4d94-a1a7-54215f922eb7',
        webhookId: 'fasta-drug-repurposing-hook',
        name: 'FASTA Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2,
        position: [-64, 640],
    })
    FastaWebhook = {
        httpMethod: 'POST',
        path: 'fasta-drug-repurposing',
        responseMode: 'responseNode',
        options: {
            binaryPropertyName: 'sequence',
        },
    };

    @node({
        id: 'df3692bb-92d6-4448-b4b3-d6bd95521e64',
        name: 'Parse And Validate FASTA',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [160, 640],
    })
    ParseAndValidateFasta = {
        jsCode: `// INPUT: POST body with {"sequence": ">Header\\nATCGATCG..."}
// OUTPUT: Normalized sequence array
const input = $input.first();
const raw = input.json.body?.sequence ?? input.json.sequence ?? '';

if (!raw) {
  throw new Error('Validation failed: No sequence provided. Expected {"sequence": "...fasta..."}');
}

const lines = raw.split('\\n');
const sequences = [];
let cur = null;

for (let line of lines) {
  line = line.trim();
  if (!line) continue;
  if (line.startsWith('>')) {
    if (cur) sequences.push(cur);
    cur = { header: line.substring(1), seq: '' };
  } else {
    if (!cur) cur = { header: 'Unknown', seq: '' };
    // normalise sequence
    const t = line.replace(/\\s+/g, '');
    if (/[^ACGTUWSMKRYBDHVNX-]/i.test(t) && /[^ARNDCQEGHILKMFPSTWYV*-]/i.test(t)) {
        throw new Error('Validation failed: Sequence contains invalid characters.');
    }
    cur.seq += t.toUpperCase(); // normalise to uppercase
  }
}
if (cur) sequences.push(cur);

if (sequences.length === 0) throw new Error('Validation failed: No valid FASTA sequences found.');

// Validate sequence characters
for (const s of sequences) {
  if (!s.seq) throw new Error(\`Validation failed: Sequence '\${s.header}' is empty.\`);
}

return sequences.map(s => ({ json: s }));`,
    };

    @node({
        id: '27ec354c-1d70-4f59-bc01-e23113945cc8',
        name: 'NCBI BLAST Submit',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [384, 640],
    })
    NcbiBlastSubmit = {
        method: 'POST',
        url: 'https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi',
        sendBody: true,
        contentType: 'x-www-form-urlencoded',
        bodyParameters: {
            parameters: [
                {
                    name: 'CMD',
                    value: 'Put',
                },
                {
                    name: 'PROGRAM',
                    value: 'blastp',
                },
                {
                    name: 'DATABASE',
                    value: 'swissprot',
                },
                {
                    name: 'QUERY',
                    value: '={{ $json.seq }}',
                },
            ],
        },
        options: {
            response: {
                response: {
                    fullResponse: true,
                },
            },
        },
    };

    @node({
        id: '1fb937c4-067f-44aa-9c3f-c3c2a688a2a0',
        name: 'Extract Request ID',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [544, 640],
    })
    ExtractRequestId = {
        jsCode: `// Extract BLAST Request ID from NCBI's HTML response
const input = $input.first().json;
const html = input.data ?? '';

const ridMatch = html.match(/name="RID"\\s+value="([^"]+)"/i)
              ?? html.match(/RID = ([a-zA-Z0-9_-]+)/);

if (!ridMatch || !ridMatch[1]) {
  throw new Error('Failed to extract BLAST RID from NCBI response');
}

const rid = ridMatch[1];
const rtoeMatch = html.match(/name="RTOE"\\s+value="(\\d+)"/i)
               ?? html.match(/RTOE = (\\d+)/);
const rtoe = rtoeMatch ? parseInt(rtoeMatch[1], 10) : 10;

return [{ json: {
  rid,
  estimatedWaitSeconds: rtoe,
  status: 'PENDING',
  ncbiUrl: \`https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi?CMD=Get&RID=\${rid}\`
}}];`,
    };

    @node({
        id: 'ec4af6ff-4530-4e38-89c0-639a04a55d7f',
        name: 'BLAST Get Results',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [912, 640],
    })
    BlastGetResults = {
        method: 'GET',
        url: 'https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi',
        sendQuery: true,
        queryParameters: {
            parameters: [
                {
                    name: 'CMD',
                    value: 'Get',
                },
                {
                    name: 'FORMAT_TYPE',
                    value: 'JSON2_S',
                },
                {
                    name: 'RID',
                    value: '={{ $json.rid }}',
                },
            ],
        },
        options: {},
    };

    @node({
        id: 'dae0aeb7-1606-4447-9759-3a328d8b94f6',
        name: 'Extract Gene Symbols',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1136, 640],
    })
    ExtractGeneSymbols = {
        jsCode: `const data = $input.first().json;
const rid = $('Extract Request ID').item.json.rid;

// NCBI returns HTML with "Status=WAITING" if not ready
if (typeof data === 'string' && data.includes('Status=WAITING')) {
  return [{ json: { isReady: false, rid } }];
}

// If it's valid JSON but empty or format error
if (!data || !data.BlastOutput2) {
  return [{ json: { isReady: false, rid } }];
}

// Parse successful BLAST JSON
const hits = data.BlastOutput2[0]?.report?.results?.search?.hits ?? [];
const genes = new Set();

for (const hit of hits) {
  // Extract gene symbols from definition line, e.g., "GN=BRCA1"
  const title = hit.description?.[0]?.title ?? '';
  const match = title.match(/GN=([a-zA-Z0-9_]+)/i);
  if (match && match[1]) {
    genes.add(match[1].toUpperCase());
  }
}

if (genes.size === 0) {
  // fallback if no GN= found, just take first word of accession
  for (const hit of hits.slice(0, 5)) {
    const acc = hit.description?.[0]?.accession;
    if (acc) genes.add(acc);
  }
}

return [{ json: {
  isReady: true,
  rid,
  geneCount: genes.size,
  totalHits: hits.length,
  genes: Array.from(genes)
}}];`,
    };

    @node({
        id: '2cd007d4-839f-431f-b51f-6143c6b206d9',
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
                leftValue: '',
                typeValidation: 'strict',
                version: 3,
            },
            conditions: [
                {
                    id: '30041650-ee64-4d49-984d-1360f4794e74',
                    leftValue: '={{ $json.isReady }}',
                    rightValue: false,
                    operator: {
                        type: 'boolean',
                        operation: 'true',
                        singleValue: true,
                    },
                },
            ],
            combinator: 'or',
        },
        options: {},
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
    // ROUTING AND CONNECTIONS
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