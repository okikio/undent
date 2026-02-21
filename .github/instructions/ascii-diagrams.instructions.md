---
applyTo: "**/*.ts,**/*.md"
---

# ASCII Diagrams

Use ASCII diagrams to make complex systems, data flows, and algorithms visually understandable. Diagrams should clarify—not decorate.

## When to Use

- Data flow between components or services
- State machines and transitions
- Algorithm steps and decision trees
- Memory layouts and binary structures
- Request/response lifecycles
- Tree structures and hierarchies

## Style

Keep diagrams simple and readable in monospace fonts. Use box-drawing characters for clean lines:

```
┌──────┐  ─  │  ┐  └  ┘  ├  ┤  ┬  ┴  ┼
│      │
└──────┘
```

Or stick with ASCII when portability matters:

```
+------+  -  |  +
|      |
+------+
```

## Examples

**Data flow:**
```
Request
   │
   ▼
┌─────────┐    ┌────────────┐    ┌──────────┐
│  Auth   │───▶│ Validation │───▶│ Handler  │
└─────────┘    └────────────┘    └──────────┘
                                      │
                                      ▼
                                 ┌──────────┐
                                 │ Response │
                                 └──────────┘
```

**State machine:**
```
           start
              │
              ▼
         ┌────────┐
    ┌───▶│  Idle  │◀──────┐
    │    └────────┘       │
    │         │           │
    │    submit()      cancel()
    │         │           │
    │         ▼           │
    │    ┌────────┐       │
 done()  │Loading │───────┤
    │    └────────┘       │
    │         │        error()
    │      success        │
    │         │           │
    │         ▼           ▼
    │    ┌────────┐  ┌────────┐
    └────│Success │  │ Error  │
         └────────┘  └────────┘
```

**Binary layout:**
```
Byte:    0       1       2       3
       ┌───────┬───────┬───────────────┐
       │ Flags │ Type  │    Length     │
       │ 8-bit │ 8-bit │    16-bit     │
       └───────┴───────┴───────────────┘
         0xFF    0x01      0x00 0x20

Flags breakdown:
  Bit 7: Reserved
  Bit 6: Compressed
  Bit 5: Encrypted
  Bits 0-4: Version
```

**Tree/hierarchy:**
```
root/
├── core/
│   ├── build.ts
│   ├── context.ts
│   └── plugins/
│       ├── cdn.ts
│       └── http.ts
├── edge/
│   └── endpoints/
└── utils/
    └── mod.ts
```

**Algorithm steps:**
```
Input: [3, 1, 4, 1, 5, 9, 2, 6]

Step 1: Split
        [3, 1, 4, 1]  [5, 9, 2, 6]

Step 2: Split again
        [3, 1] [4, 1]  [5, 9] [2, 6]

Step 3: Split to singles
        [3] [1] [4] [1]  [5] [9] [2] [6]

Step 4: Merge pairs (sorted)
        [1, 3] [1, 4]  [5, 9] [2, 6]

Step 5: Merge quads
        [1, 1, 3, 4]  [2, 5, 6, 9]

Step 6: Final merge
        [1, 1, 2, 3, 4, 5, 6, 9]
```

## Placement

Put diagrams in:
- TSDoc comments above functions/classes
- README sections explaining architecture
- Inline comments for complex algorithms

Always accompany diagrams with prose that explains what the reader is looking at.