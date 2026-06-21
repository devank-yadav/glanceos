import { PageHeader } from "../components/PageHeader";
import { StarterTemplates } from "../components/StarterTemplates";

// Templates: the built-in starter gallery + approved community templates, plus
// the "Publish a board" submission flow and (for admins) the review queue — all
// in <StarterTemplates/>.
export function HubPage() {
  return (
    <>
      <PageHeader title="Templates" />
      <div class="shell-content">
        <StarterTemplates />
      </div>
    </>
  );
}
