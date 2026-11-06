# Email templates (Resend)

## 1. Run ready, to Raghav (step 14)

**Subject:** `{{weekday}} run: {{action_count}} flags, {{exception_count}} exceptions`

```
{{summary}}

Needs your call first:
{{#each top_exceptions}}- {{sku}} {{name}}: {{reason}}
{{/each}}

Open the review queue: {{app_url}}/runs/{{run_date}}

Data used: SAP sales to week of {{last_complete_week}}, SAP stock at {{stock_time}}, {{open_po_count}} open POs from Zoho.
```

## 2. Run blocked, to Raghav and IT

**Subject:** `{{weekday}} run stopped: {{first_issue_short}}`

```
The planner did not run because of a data problem. Nothing was planned.

{{#each issues}}- {{message}}
{{/each}}

Once IT re-exports the file, press "Run now" in the app.
```

## 3. Approved list, to procurement (step 18)

**Subject:** `Approved reorders, {{run_date}}: {{line_count}} SKUs`

```
Raghav approved {{line_count}} reorder lines ({{total_units}} units) in the {{weekday}} run.
The CSV is attached. Please raise the POs in Zoho as usual.

{{#each lines_preview}}- {{sku}} {{name}}: {{final_qty}} units{{#if note}} ({{note}}){{/if}}
{{/each}}

Paused SKUs (do not reorder this cycle): {{paused_list}}
```
