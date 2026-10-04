"""Rebuild maternal-health-atlas.workflow.json from dashboard_query.sql and
geocode_addresses.js, so the importable workflow always matches the source files.

    python3 n8n/build_workflow.py
"""

import json
import uuid
from pathlib import Path

HERE = Path(__file__).parent


def node_id(name: str) -> str:
    # Stable ids, so re-importing updates the same nodes.
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"maternal-health-atlas/{name}"))


BUILD_RESPONSE = """// Adds the map areas from "Geocode addresses" to the counts from "Read census tables".
const counts = $input.first().json.payload;
const geo = $('Geocode addresses').first().json;
return [{ json: { ...counts, areas: geo.areas, geocoding: geo.geocoding } }];
"""

READ_ADDRESSES = """SELECT original_id, address
FROM public.patient_identification
WHERE nullif(trim(address), '') IS NOT NULL;"""

CENSUS_DB = {"postgres": {"id": "", "name": "Census database"}}

nodes = [
    {
        "parameters": {
            "httpMethod": "GET",
            "path": "maternal-health-atlas",
            "authentication": "headerAuth",
            "responseMode": "responseNode",
            "options": {},
        },
        "id": node_id("webhook"),
        "name": "Dashboard request",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [0, 0],
        "webhookId": node_id("webhookId"),
        "credentials": {"httpHeaderAuth": {"id": "", "name": "Dashboard key"}},
    },
    {
        "parameters": {"operation": "executeQuery", "query": READ_ADDRESSES, "options": {}},
        "id": node_id("addresses"),
        "name": "Read addresses",
        "type": "n8n-nodes-base.postgres",
        "typeVersion": 2.5,
        "position": [240, 0],
        "credentials": CENSUS_DB,
        # Keep going when no woman has an address yet.
        "alwaysOutputData": True,
    },
    {
        "parameters": {"jsCode": (HERE / "geocode_addresses.js").read_text()},
        "id": node_id("geocode"),
        "name": "Geocode addresses",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [480, 0],
    },
    {
        # A leading "=" makes n8n fill in the {{ ... }} expression in the query.
        "parameters": {"operation": "executeQuery", "query": "=" + (HERE / "dashboard_query.sql").read_text(), "options": {}},
        "id": node_id("read"),
        "name": "Read census tables",
        "type": "n8n-nodes-base.postgres",
        "typeVersion": 2.5,
        "position": [720, 0],
        "credentials": CENSUS_DB,
    },
    {
        "parameters": {"jsCode": BUILD_RESPONSE},
        "id": node_id("build"),
        "name": "Build dashboard data",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [960, 0],
    },
    {
        "parameters": {
            "respondWith": "firstIncomingItem",
            "options": {"responseHeaders": {"entries": [{"name": "Cache-Control", "value": "no-store"}]}},
        },
        "id": node_id("respond"),
        "name": "Send to dashboard",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.1,
        "position": [1200, 0],
    },
]

order = [n["name"] for n in nodes]
workflow = {
    "name": "Maternal Health Atlas",
    "nodes": nodes,
    "connections": {
        a: {"main": [[{"node": b, "type": "main", "index": 0}]]} for a, b in zip(order, order[1:])
    },
    # Addresses pass through this workflow, so successful runs are not kept in n8n's
    # execution history.
    "settings": {"executionOrder": "v1", "saveDataSuccessExecution": "none"},
    "pinData": {},
}

out = HERE / "maternal-health-atlas.workflow.json"
out.write_text(json.dumps(workflow, indent=2) + "\n")
print(f"Wrote {out.name}: {' -> '.join(order)}")
