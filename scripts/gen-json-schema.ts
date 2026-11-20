/** 由 src/lib/import/schema.ts 產生 docs/aiwr-v1.schema.json(改了格式後執行 npm run gen:schema) */
import { writeFileSync } from "node:fs";
import { zodToJsonSchema } from "zod-to-json-schema";
import { reportSchema } from "../src/lib/import/schema";

const schema = zodToJsonSchema(reportSchema, { name: "aiwr-v1", $refStrategy: "none" });
writeFileSync("docs/aiwr-v1.schema.json", JSON.stringify(schema, null, 2) + "\n");
console.log("wrote docs/aiwr-v1.schema.json");
