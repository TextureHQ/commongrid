-- Additive registry entry. Unknown dataset license and exact observation date
-- remain unknown; public availability is not a license assertion.
INSERT INTO data_sources (id, display_name, authority_tier, cadence, homepage_url)
VALUES ('vt-psd', 'Vermont Department of Public Service', 'state', 'irregular',
  'https://publicservice.vermont.gov/electric-utility-service-territory-map')
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- Spatial history belongs to the same least-privilege publisher as attributes.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'commongrid_sync') THEN
    GRANT SELECT, INSERT ON TABLE public.entity_geometry_versions TO commongrid_sync;
    GRANT USAGE, SELECT ON SEQUENCE public.entity_geometry_versions_id_seq TO commongrid_sync;
  END IF;
END $$;
