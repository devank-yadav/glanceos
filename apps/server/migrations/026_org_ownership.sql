-- Re-home every owned resource onto an org. We ADD a nullable org_id (back-filled to
-- the owner's personal org) and KEEP user_id as "created_by" — so the dozens of existing
-- `WHERE user_id = ?` helpers keep working while we migrate them to org scope one batch
-- at a time (incremental + reversible, vs. a big-bang rebuild of ~9 FK tables at once).
-- For solo accounts the two are interchangeable: org_id = the personal org ⟺ user_id =
-- that user, so a solo install behaves byte-identically until a second member joins.

ALTER TABLE devices        ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE layouts        ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE tasks          ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE connections    ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE display_groups ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE uploads        ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE inlets         ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE automations    ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE api_keys       ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;

-- Back-fill org_id = the owner's personal org. Built-in templates (layouts.is_template=1,
-- user_id NULL) stay org_id NULL — a global catalog readable by everyone, unchanged.
UPDATE devices        SET org_id = (SELECT o.id FROM organizations o WHERE o.created_by = devices.user_id        AND o.personal = 1) WHERE user_id IS NOT NULL;
UPDATE layouts        SET org_id = (SELECT o.id FROM organizations o WHERE o.created_by = layouts.user_id        AND o.personal = 1) WHERE user_id IS NOT NULL;
UPDATE tasks          SET org_id = (SELECT o.id FROM organizations o WHERE o.created_by = tasks.user_id          AND o.personal = 1) WHERE user_id IS NOT NULL;
UPDATE connections    SET org_id = (SELECT o.id FROM organizations o WHERE o.created_by = connections.user_id    AND o.personal = 1) WHERE user_id IS NOT NULL;
UPDATE display_groups SET org_id = (SELECT o.id FROM organizations o WHERE o.created_by = display_groups.user_id AND o.personal = 1) WHERE user_id IS NOT NULL;
UPDATE uploads        SET org_id = (SELECT o.id FROM organizations o WHERE o.created_by = uploads.user_id        AND o.personal = 1) WHERE user_id IS NOT NULL;
UPDATE inlets         SET org_id = (SELECT o.id FROM organizations o WHERE o.created_by = inlets.user_id         AND o.personal = 1) WHERE user_id IS NOT NULL;
UPDATE automations    SET org_id = (SELECT o.id FROM organizations o WHERE o.created_by = automations.user_id    AND o.personal = 1) WHERE user_id IS NOT NULL;
UPDATE api_keys       SET org_id = (SELECT o.id FROM organizations o WHERE o.created_by = api_keys.user_id       AND o.personal = 1) WHERE user_id IS NOT NULL;

CREATE INDEX idx_devices_org        ON devices(org_id);
CREATE INDEX idx_layouts_org        ON layouts(org_id);
CREATE INDEX idx_tasks_org          ON tasks(org_id);
CREATE INDEX idx_connections_org    ON connections(org_id);
CREATE INDEX idx_display_groups_org ON display_groups(org_id);
CREATE INDEX idx_uploads_org        ON uploads(org_id);
CREATE INDEX idx_inlets_org         ON inlets(org_id);
CREATE INDEX idx_automations_org    ON automations(org_id);
CREATE INDEX idx_api_keys_org       ON api_keys(org_id);
