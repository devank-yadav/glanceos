import { templates } from "@glanceos/schema";
import { db } from "./db";
import { createLayout } from "./layouts";

// Builtins: is_template = 1, user_id NULL (author shown as "GlanceOS"),
// published so they appear in the hub for every user.
export function seedTemplates(): void {
  for (const template of templates) {
    const exists = db
      .prepare("SELECT id FROM layouts WHERE is_template = 1 AND name = ?")
      .get(template.name);
    if (!exists) {
      createLayout(template.name, template, {
        userId: null,
        isTemplate: true,
        published: true,
        description: "A starting point from GlanceOS.",
      });
      console.log(`[seed] template "${template.name}"`);
    }
  }
}
