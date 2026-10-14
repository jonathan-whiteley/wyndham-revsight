"""RevSight IQ data models configuration.

Defines the data models (NT Performance and STR Comp Set) that are routed
to specific Genie agents and metric views. The catalog and schema of each
metric view come from config.env (see config/settings.py).
"""

from config.settings import fq

MODELS = {
    "nt": {
        "key": "nt",
        "label": "NT Performance (daily)",
        "agent_name": "Wyndham NT Performance",
        "metric_view_name": "mv_nt_performance",
        "grain": "site x stay date (daily)",
        "space_env": "GENIE_SPACE_NT",
        "field_groups": [
            {
                "label": "Measures",
                "kind": "measure",
                "fields": [
                    {"name": "occupancy", "label": "Occupancy", "kind": "measure", "followup": "Add {label}"},
                    {"name": "adr", "label": "ADR", "kind": "measure", "followup": "Add {label}"},
                    {"name": "revpar", "label": "RevPAR", "kind": "measure", "followup": "Add {label}"},
                    {"name": "room_revenue", "label": "Room revenue", "kind": "measure", "followup": "Add {label}"},
                    {"name": "rooms_sold", "label": "Rooms sold", "kind": "measure", "followup": "Add {label}"},
                    {"name": "rooms_available", "label": "Rooms available", "kind": "measure", "followup": "Add {label}"},
                    {"name": "site_count", "label": "Site count", "kind": "measure", "followup": "Add {label}"},
                ]
            },
            {
                "label": "Time",
                "kind": "dimension",
                "fields": [
                    {"name": "stay_date", "label": "Stay date", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "week_start", "label": "Week", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "month", "label": "Month", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "quarter", "label": "Quarter", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "year", "label": "Year", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "day_of_week", "label": "Day of week", "kind": "dimension", "followup": "Break that down by {label}"},
                ]
            },
            {
                "label": "Property",
                "kind": "dimension",
                "fields": [
                    {"name": "site_id", "label": "Site", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "property_name", "label": "Property name", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "brand", "label": "Brand", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "chain_scale", "label": "Chain scale", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "ownership", "label": "Ownership", "kind": "dimension", "followup": "Break that down by {label}"},
                ]
            },
            {
                "label": "Geography",
                "kind": "dimension",
                "fields": [
                    {"name": "state", "label": "State", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "city", "label": "City", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "market", "label": "Market", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "region", "label": "Region", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "hurricane_market", "label": "Hurricane market", "kind": "dimension", "followup": "Break that down by {label}"},
                ]
            },
        ]
    },
    "str": {
        "key": "str",
        "label": "STR Comp Set (weekly)",
        "agent_name": "Wyndham STR Comp Set",
        "metric_view_name": "mv_str_compset",
        "grain": "site x week (complete comp weeks only)",
        "space_env": "GENIE_SPACE_STR",
        "field_groups": [
            {
                "label": "Index measures",
                "kind": "measure",
                "fields": [
                    {"name": "rgi", "label": "RGI", "kind": "measure", "followup": "Add {label}"},
                    {"name": "mpi", "label": "MPI", "kind": "measure", "followup": "Add {label}"},
                    {"name": "ari", "label": "ARI", "kind": "measure", "followup": "Add {label}"},
                ]
            },
            {
                "label": "Own vs comp",
                "kind": "measure",
                "fields": [
                    {"name": "revpar", "label": "RevPAR", "kind": "measure", "followup": "Add {label}"},
                    {"name": "comp_revpar", "label": "Comp RevPAR", "kind": "measure", "followup": "Add {label}"},
                    {"name": "adr", "label": "ADR", "kind": "measure", "followup": "Add {label}"},
                    {"name": "comp_adr", "label": "Comp ADR", "kind": "measure", "followup": "Add {label}"},
                    {"name": "occupancy", "label": "Occupancy", "kind": "measure", "followup": "Add {label}"},
                    {"name": "comp_occupancy", "label": "Comp occupancy", "kind": "measure", "followup": "Add {label}"},
                ]
            },
            {
                "label": "Time",
                "kind": "dimension",
                "fields": [
                    {"name": "week_start", "label": "Week", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "month", "label": "Month", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "year", "label": "Year", "kind": "dimension", "followup": "Break that down by {label}"},
                ]
            },
            {
                "label": "Property",
                "kind": "dimension",
                "fields": [
                    {"name": "site_id", "label": "Site", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "property_name", "label": "Property name", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "brand", "label": "Brand", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "chain_scale", "label": "Chain scale", "kind": "dimension", "followup": "Break that down by {label}"},
                ]
            },
            {
                "label": "Geography",
                "kind": "dimension",
                "fields": [
                    {"name": "state", "label": "State", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "market", "label": "Market", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "region", "label": "Region", "kind": "dimension", "followup": "Break that down by {label}"},
                    {"name": "hurricane_market", "label": "Hurricane market", "kind": "dimension", "followup": "Break that down by {label}"},
                ]
            },
        ]
    }
}


def get_model_config(model_key):
    """Retrieve model configuration by key."""
    if model_key not in MODELS:
        raise ValueError(f"Unknown model: {model_key}")
    return {**MODELS[model_key], "metric_view": fq(MODELS[model_key]["metric_view_name"])}


def get_all_models():
    """Return list of all models for the /models endpoint."""
    return [
        {
            "key": cfg["key"],
            "label": cfg["label"],
            "agent_name": cfg["agent_name"],
            "metric_view": fq(cfg["metric_view_name"]),
            "grain": cfg["grain"],
        }
        for cfg in MODELS.values()
    ]
