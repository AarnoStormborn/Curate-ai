-- PostgreSQL initialization script for Curate AI
-- Run automatically by Docker on first startup

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create indexes for vector similarity search (will be used after tables exist)
-- These are created by Alembic migrations, this is just a safety net
