-- Public read-only share links. A layout with a non-null share_token can be
-- viewed (no login) at /screen/?share=<token> via the public board endpoint.
-- The token is an unguessable random id; revoking = setting it back to NULL.
ALTER TABLE layouts ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX idx_layouts_share ON layouts(share_token) WHERE share_token IS NOT NULL;
