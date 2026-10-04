---
name: Orval export collisions
description: Avoid recurring collisions between generated path and query parameter types
---

Resolve duplicate generated exports at the generator configuration or OpenAPI naming layer, never by removing exports from a generated barrel.

**Why:** The generator produced the same verification-parameter identifier for a path Zod schema and a query parameter type. Editing the barrel only worked until the next codegen run; configuring parameter-schema generation removed the conflict while route identifiers stayed explicitly validated.

**How to apply:** If parameter exports collide after an OpenAPI change, inspect both query type names and generated path schemas. Preserve runtime route validation when disabling generated parameter schemas.