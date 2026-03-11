---
marp: true
theme: neo4j
paginate: true
math: katex
---

<!-- _class: lead marigold -->

![width:160px](../assets/logo-white.png)

# GRAPH TYPE
### Schema Enforcement Made Easy
*Preview Feature · Neo4j 2026.02 · Cypher 25*

---

## Agenda

1. **The Problem** — managing schema with individual constraints
2. **What is GRAPH TYPE?** — a unified, declarative schema model
3. **Core Syntax** — node types, label implications, relationship types
4. **Lifecycle** — SET, ADD, ALTER, DROP, SHOW
5. **Under the Hood** — how graph types translate to constraints
6. **Open Graph Type** — staying flexible while enforcing rules
7. **When to Use It**

---

<!-- _class: lead marigold -->

# The Problem

---

## Neo4j is Schema-Optional — And That's Great

Neo4j's flexibility lets you move fast during development:

- Start writing data immediately — no schema required up front
- Evolve your model freely during prototyping
- No `ALTER TABLE` migrations when requirements shift
- Graph patterns emerge organically from the data

> "Schema-optional lets you *think* in graphs before you lock anything down."

*But eventually, it's time to go to production — and you need rules.*

---

## The Old Way: Piecemeal Constraints

Enforcing a strict data model meant one command per rule:

```cypher
CREATE CONSTRAINT FOR (p:Person) REQUIRE p.name IS NOT NULL;
CREATE CONSTRAINT FOR (p:Person) REQUIRE p.name IS :: STRING;
CREATE CONSTRAINT FOR (p:Person) REQUIRE p.ssn IS :: INTEGER;
CREATE CONSTRAINT FOR (p:Person)
  REQUIRE (p.name, p.ssn) IS KEY;
// ... repeat for every label, every property
```

*This scatters your schema logic across the database metadata. Large models require dozens of isolated rules — hard to read, maintain, and audit.*

---

<!-- _class: lead marigold -->

# Introducing GRAPH TYPE

---
<!-- _class: dense -->
## One Command to Define Your Entire Model

**GRAPH TYPE** lets you declare nodes, label implications, and relationship connections in a single, readable structure.

```cypher
ALTER CURRENT GRAPH TYPE SET {
  (:Person => :Resident {name :: STRING NOT NULL}),
  (:Pet => :Resident&Animal {
    healthCertificate :: STRING,
    name :: STRING
  }),
  (:City => {name :: STRING NOT NULL, population :: INTEGER}),
  (:Resident)-[:LIVES_IN => {since :: DATE NOT NULL}]->(:City)
}
```

*The database automatically creates all necessary constraints to enforce it.*

---

## Availability

GRAPH TYPE is a **preview feature** introduced in **Neo4j 2026.02**:

- **Cypher 25** only
- Available in **Enterprise Edition**, **Infinigraph Edition**, and **all Neo4j Aura tiers**
- Not supported for production use — intended for evaluation and feedback
- Syntax and capabilities may change before GA
- Share feedback at **graphtype@neo4j.com**

---

<!-- _class: lead marigold -->

# Core Syntax

---

## Node Element Types

A **node element type** is defined by an *identifying label*. It enforces implied labels and property rules on all nodes carrying that label.

```cypher
// :Person nodes must also carry :Resident; name is required
(:Person => :Resident {name :: STRING NOT NULL, ssn :: INTEGER}),
// :Pet nodes must carry both :Resident AND :Animal
(:Pet => :Resident&Animal {
  insuranceNumber :: INTEGER IS KEY,
  healthCertificate :: STRING IS UNIQUE,
  name :: STRING
})
```

---

## Node Element Type — Key Rules

```
(:IdentifyingLabel => [:ImpliedLabel1[&...]]
  { property :: TYPE [NOT NULL] })
```

- The **identifying label** must be unique across all node element types
- `NOT NULL` — property must exist on every node; shorthand `!` also works
- Properties **without** `NOT NULL` — type enforced only if the property is present
- `ANY NOT NULL` — property must exist; any valid property type accepted
- Implied labels are enforced to exist on every node with the identifying label

---

## Relationship Element Types

A **relationship element type** restricts the source label, target label, and properties of a relationship type.

```cypher
// LIVES_IN must connect :Resident → :City, with a required since
(:Resident)-[:LIVES_IN => {since :: DATE NOT NULL}]->(:City),

// WORKS_FOR: :Person → :Company, role is typed but optional
(:Person)-[:WORKS_FOR => {role :: STRING}]->(:Company)
```

The `=>` after the relationship type marks it as part of the graph type. Source and target nodes are both optional in the syntax — only declare what you need to enforce.

---

## Key and Uniqueness Constraints in the Schema

Constraints can be declared **inline** or with the `REQUIRE` keyword:

```cypher
// Inline — single property key and uniqueness
(:Pet => :Resident&Animal {
  insuranceNumber   :: INTEGER IS KEY,
  healthCertificate :: STRING IS UNIQUE,
  name              :: STRING
}),
// REQUIRE — composite key (variable + parentheses required)
(p:Person => :Resident {name :: STRING, ssn :: INTEGER})
  REQUIRE (p.name, p.ssn) IS KEY
```

---

<!-- _class: lead marigold -->

# Lifecycle: SET · ADD · ALTER · DROP · SHOW

---

## SET — Define the Baseline

`ALTER CURRENT GRAPH TYPE SET` defines (or fully resets) the schema. Any previously defined graph type is **overwritten**.

```cypher
ALTER CURRENT GRAPH TYPE SET {
  (c:Crew => :Person {id :: STRING, name :: STRING NOT NULL})
    REQUIRE c.id IS KEY,
  (s:Ship => {registryCode :: STRING, class :: STRING NOT NULL})
    REQUIRE s.registryCode IS KEY,
  (:Crew)-[:ASSIGNED_TO => {since :: DATE}]->(:Ship)
}
```

*This single command automatically generates 12 constraints.*

---
<!-- _class: dense -->

```cypher
// ✅ Valid writes
CREATE (:Ship {registryCode: "NCC-1701", class: "Constitution"});
CREATE (:Crew:Person {id: "SC-937-0176", name: "James T. Kirk"});
MATCH (c:Crew {id: "SC-937-0176"}), (s:Ship {registryCode: "NCC-1701"})
CREATE (c)-[:ASSIGNED_TO {since: date("2265-01-01")}]->(s);
```

```cypher
// ❌ Fails: :Crew without its implied :Person label
CREATE (:Crew {id: "SC-000", name: "Unknown"});

// ❌ Fails: a :Ship cannot be ASSIGNED_TO another :Ship
MATCH (s:Ship {registryCode: "NCC-1701"})
CREATE (s)-[:ASSIGNED_TO {since: date()}]->(s);
```

---
<!-- _class: dense -->

## ADD — Extend Without Disruption

`ALTER CURRENT GRAPH TYPE ADD` adds **entirely new** element types to the existing graph type. It cannot modify existing ones.

```cypher
ALTER CURRENT GRAPH TYPE ADD {
  (p:Planet => :CelestialBody&Location {
    name        :: STRING,
    coordinates :: POINT NOT NULL
  }) REQUIRE p.name IS UNIQUE,
  (:Ship)-[:BOLDLY_GOES_TO =>]->(:Planet)
}

// ✅ All implied labels must be present
CREATE (:Planet:CelestialBody:Location {
  name: "Vulcan",
  coordinates: point({x: 2.3, y: 4.5, z: 1.1})
});
```

---

## ALTER — Modify an Element Type

`ALTER CURRENT GRAPH TYPE ALTER` redefines specific element types. **Repeat all properties you want to keep** — anything omitted stops being enforced.

```cypher
ALTER CURRENT GRAPH TYPE ALTER {
  // Add implied :Machine label and new id property to :Robot
  (:Robot => :Resident&Machine {
    application :: STRING NOT NULL,
    id          :: INTEGER NOT NULL
  }),
  // Relax since from DATE to ANY on LIVES_IN
  (:Resident)-[:LIVES_IN => {since :: ANY NOT NULL}]->(:City)
}
```

*Key and uniqueness constraints cannot be added or changed via `ALTER`.*

---
<!-- _class: dense -->

## DROP — Remove Elements or Constraints

`ALTER CURRENT GRAPH TYPE DROP` removes element types or named constraints.

```cypher
// Drop element types (identifying label/type + => is enough)
ALTER CURRENT GRAPH TYPE DROP {
  (:Pet =>),
  ()-[:LIVES_IN =>]->()
}
```

```cypher
// Drop named constraints by their constraint name
ALTER CURRENT GRAPH TYPE DROP {
  CONSTRAINT animal_id,
  CONSTRAINT constraint_302a3693
}
```

*Dropping an element type removes its dependent constraints. Key/uniqueness constraints survive and must be dropped by name.*

---

## SHOW — Inspect the Full Schema
<!-- _class: dense -->
`SHOW CURRENT GRAPH TYPE` returns the complete canonical specification as a single string — always in sync with the actual constraints.

```cypher
SHOW CURRENT GRAPH TYPE
```

Result (excerpt from the docs):

```
(:`Person` => :`Resident` {`name` :: STRING, `ssn` :: INTEGER}),
(:`Pet` => :`Animal`&`Resident` {`healthCertificate` :: STRING, ...}),
(:`Resident`)-[:`LIVES_IN` => {`since` :: ANY NOT NULL}]->(:`City` =>),
CONSTRAINT `company_name` FOR (`n`:`Company`) REQUIRE (`n`.`name`) IS KEY
```

*Acts as living, queryable documentation of your data model.*

---

<!-- _class: lead marigold -->

# Under the Hood

---

<!-- _class: dense -->

## Graph Type → Constraints (Automatically)

Every element type is translated into a set of constraints. From the docs — this single node element type:

```cypher
(:Robot => :Resident&Machine
  { application :: STRING NOT NULL, id :: INTEGER NOT NULL })
```

Automatically generates **6 constraints**:

| Constraint type | Detail |
|---|---|
| Node property type + existence | `application :: STRING NOT NULL` |
| Node property type + existence | `id :: INTEGER NOT NULL` |
| Node label existence | Must also have `:Resident` |
| Node label existence | Must also have `:Machine` |

---

## Constraint Classification

`SHOW CONSTRAINTS` returns a `classification` column explaining each constraint's relationship to the graph type:

```cypher
SHOW CONSTRAINTS
YIELD name, type, labelsOrTypes, enforcedLabel, classification
ORDER BY labelsOrTypes
```

| Classification | Meaning |
|---|---|
| `dependent` | Auto-generated by an element type — cannot be dropped individually |
| `undesignated` | Key or uniqueness constraint — can be dropped by name |
| `independent` | Constraint on a non-identifying label — lives independently |

---

<!-- _class: lead marigold -->

# Open Graph Type

---

## What "Open" Means

The current preview supports **open graph types**: what you define is enforced, but extra properties and labels are still allowed.

```cypher
// Extra property on a schema-defined node — ✅ allowed
CREATE (:Person:Resident {
  name: 'Carl Ericson', ssn: 162734679,
  born: date('1998-08-08')  // born is not in the schema
});
// Node with only implied labels, no identifying label — ✅ allowed
CREATE (:StrayAnimal:Animal:Resident {id: '24.09-172898'});
// Entirely new label/type not in the schema — ✅ allowed
CREATE (:Company {name: 'Healthy Pets Inc.'});
```

---

## Constraints on Non-Identifying Labels

Rules can also be added on labels that are not identifying labels in any element type, using the `CONSTRAINT … FOR … REQUIRE` syntax:

```cypher
// Add standalone constraints alongside element types
ALTER CURRENT GRAPH TYPE SET {
  (:Person => :Resident {name :: STRING, ssn :: INTEGER})
    REQUIRE (p.name, p.ssn) IS KEY,
  (:Resident)-[:LIVES_IN => {since :: DATE NOT NULL}]->(:City),
  CONSTRAINT company_name FOR (c:Company) REQUIRE c.name IS KEY,
  CONSTRAINT animal_id FOR (a:Animal) REQUIRE a.id IS UNIQUE,
  CONSTRAINT resident_address FOR (r:Resident) REQUIRE r.address IS :: STRING
}
```

---

<!-- _class: lead marigold -->

# When to Use GRAPH TYPE

---

## Good Candidates

<div style="display:flex; gap:2rem;">
<div>

### ✅ Great fit
- Production databases with data quality SLAs
- Regulated industries (finance, health, insurance)
- Multi-team projects sharing a graph model
- GraphRAG pipelines requiring clean entity types
- APIs exposing graph data to external consumers

</div>
<div>

### ⚠️ Consider carefully
- Databases with conflicting legacy data (clean data first before `SET`)
- Early prototyping (start with a minimal `SET`)
- Any mission-critical workload *(preview — not yet for production)*

</div>
</div>

---

## GRAPH TYPE vs. Individual Constraints

| Capability | Individual Constraints | GRAPH TYPE |
|---|---|---|
| Property existence | ✅ | ✅ |
| Property type | ✅ | ✅ |
| **Label implication enforcement** | ❌ | ✅ |
| **Relationship source/target enforcement** | ❌ | ✅ |
| Single readable schema declaration | ❌ | ✅ |
| Runtime inspectable (`SHOW`) | Partial | ✅ |
| Evolve schema incrementally (`ADD`/`ALTER`) | Manual | ✅ |

---

<!-- _class: invert -->

## Key Takeaways

- **`SET`** to declare the full schema, **`ADD`** to extend it, **`ALTER`** to modify element types, **`DROP`** to remove
- **`SHOW CURRENT GRAPH TYPE`** — one command reveals the entire data model
- New enforcement powers: **label implication** and **relationship source/target** — impossible with individual constraints
- Schema is **open by default** — enforces what you define, permits everything else
- **Preview in Neo4j 2026.02** — try it on Aura, share feedback at graphtype@neo4j.com

---

<!-- _class: lead marigold -->

# Thank You

### Start enforcing your graph model today

Available now in **Neo4j 2026.02** and **Neo4j Aura**

[neo4j.com/docs](https://neo4j.com/docs) · graphtype@neo4j.com

*Your field experience shapes the GA release.*