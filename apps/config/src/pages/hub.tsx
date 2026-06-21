import { useState } from "preact/hooks";
import { PageHeader } from "../components/PageHeader";
import { StarterTemplates } from "../components/StarterTemplates";
import { Icon } from "../editor/icons";

// Templates: the built-in starter gallery + approved community templates, plus
// the "Publish a board" submission flow — all in <StarterTemplates/>. The publish
// action lives in the page header (the canonical top-right action spot).
export function HubPage() {
  const [publishing, setPublishing] = useState(false);
  const actions = <button class="primary" onClick={() => setPublishing(true)}><Icon.upload /> Publish a board</button>;
  return (
    <>
      <PageHeader title="Templates" actions={actions} />
      <div class="shell-content">
        <StarterTemplates publishing={publishing} onClosePublish={() => setPublishing(false)} />
      </div>
    </>
  );
}
