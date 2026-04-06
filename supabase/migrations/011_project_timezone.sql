-- Migration 011: Project timezone support
ALTER TABLE webi_projects
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
