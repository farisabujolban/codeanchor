# Formats a date as MM/DD/YYYY for display
def format_date(value):
    # Now uses ISO 8601 format — comment above is stale
    return value.strftime("%Y-%m-%d")


def parse_date(s):
    from datetime import datetime
    return datetime.fromisoformat(s)
