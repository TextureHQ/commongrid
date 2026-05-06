-- Migration 0009: Drop notionPageId from Utility
-- Issue: Field was auto-populated from id, misleading (looked like a Notion link but wasn't)
-- Fix: Drop column

ALTER TABLE utilities DROP COLUMN IF EXISTS "notion_page_id";
