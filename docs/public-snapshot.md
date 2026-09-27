# CommonGrid Public Snapshot

The weekly snapshot workflow publishes a public, allowlisted SQL dump plus map-layer GeoJSON assets.

## Included in the public SQL dump

- `public.balancing_authorities`
- `public.ev_stations`
- `public.isos`
- `public.power_plant_interconnections`
- `public.power_plants`
- `public.pricing_nodes`
- `public.programs`
- `public.regions`
- `public.rtos`
- `public.substations`
- `public.territories`
- `public.transmission_line_endpoints`
- `public.transmission_lines`
- `public.utilities`

## Not included

Private, operational, or user-linked tables are intentionally excluded from the public snapshot, including:

- `users`
- `api_keys`
- `notifications`
- `user_notification_prefs`
- `knock_delivery_log`
- `contributions`
- `contribution_appeals`
- `moderation_actions`
- `discussion_posts`
- `api_usage_events`
- `entity_locks`
- `bulk_operations`

## License

The snapshot is released under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/).

## Contract

If a dataset should be part of the public snapshot, it must be added to the workflow allowlist explicitly. New tables are excluded by default.
