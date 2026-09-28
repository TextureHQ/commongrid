# Contribution summary counts

The Contributions dashboard requests `GET /api/v1/contributions?user_id=<id>&include_summary=true`.

`include_summary=true` adds a top-level `summary` object to the existing paginated response:

```json
{
  "summary": { "total": 120, "pending": 30, "approved": 75 }
}
```

- Counts come directly from the contributions table, across the complete matching history rather than just the returned page.
- The summary respects `user_id`, `entity_type`, and `entity_id`, but ignores `status`, `page`, and `limit`.
- `total` includes all statuses, including returned, withdrawn, and superseded contributions.
- `pending` counts only `pending`; `approved` combines `approved` and `auto_approved`.
- The dashboard displays approval rate as `round(approved / total * 100)`, or `0%` when total is zero. This preserves the existing denominator, now applied to the full history.
- List rows and `pagination.total` still respect all supplied filters, including status.
- Requests without `include_summary=true` retain the existing response shape and do not execute the extra aggregate query.

Counts are refreshed alongside the list on tab changes, refresh, withdrawal, and resubmission. Changing a tab alone does not change the cards; actual changes to the underlying contribution history can.

Regression coverage lives beside the dashboard and contributions API route. The dashboard tests use a DOM environment with mocked auth, API responses, and design-system controls; API tests assert both filter scope and aggregate SQL.
